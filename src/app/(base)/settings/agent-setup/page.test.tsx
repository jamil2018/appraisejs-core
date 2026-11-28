// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ManagedJourneyProviderReadiness } from '@/services/coordinator/app-managed-journey-readiness'

const mocks = vi.hoisted(() => ({ project: vi.fn(), readiness: vi.fn(), claudeStatus: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/app-managed-journey-readiness', () => ({
  getManagedJourneyReadinessForProvider: mocks.readiness,
  managedJourneyFullyEnabled: () => true,
  managedJourneyReadinessStage: (stage: string, status?: string | null) =>
    stage === 'DISCOVERY' && status === 'COMPLETED' ? 'SCENARIO_DESIGN' : stage,
}))
vi.mock('@/services/provider-connection/claude-code-connection-service', () => ({
  getClaudeCodeConnection: mocks.claudeStatus,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('../claude-code-settings', () => ({ ClaudeCodeSettings: () => <p>Claude Code sign-in controls</p> }))
vi.mock('./refresh', () => ({ AgentSetupRefresh: () => <button>Check again</button> }))

import AgentSetupPage from './page'

const draftHref = '/quality-journeys/drafts/draft-1?project=project-1&from=chat'
const ready = (provider: 'CODEX' | 'CLAUDE_CODE'): ManagedJourneyProviderReadiness => ({
  provider,
  ready: true,
  state: 'ready',
  reason: null,
  actionLabel: null,
  settingsHref: '',
})
const blocked = (provider: 'CODEX' | 'CLAUDE_CODE'): ManagedJourneyProviderReadiness => ({
  provider,
  ready: false,
  state: 'unavailable',
  reason: `${provider} is not available for Journeys in this workspace.`,
  actionLabel: 'See options',
  settingsHref: '',
})

function setReadiness(values: Record<'CODEX' | 'CLAUDE_CODE', ManagedJourneyProviderReadiness>) {
  mocks.readiness.mockImplementation((_: unknown, provider: 'CODEX' | 'CLAUDE_CODE') =>
    Promise.resolve(values[provider]),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.claudeStatus.mockResolvedValue({ state: 'connected' })
  setReadiness({ CODEX: ready('CODEX'), CLAUDE_CODE: ready('CLAUDE_CODE') })
})

it('returns to the exact scoped draft only when the selected Journey provider is ready', async () => {
  render(
    await AgentSetupPage({
      searchParams: Promise.resolve({ project: 'project-1', provider: 'CLAUDE_CODE', returnTo: draftHref }),
    }),
  )
  expect(screen.getByRole('link', { name: 'Continue your brief' })).toHaveAttribute('href', draftHref)
  expect(screen.getByRole('link', { name: 'Return to your brief' })).toHaveAttribute('href', draftHref)
  expect(mocks.readiness).toHaveBeenCalledWith(
    { targetProjectId: 'project-1', returnTo: draftHref, stage: undefined },
    'CLAUDE_CODE',
  )
})

it('does not mistake a connected lookup status for managed Journey readiness', async () => {
  setReadiness({
    CODEX: ready('CODEX'),
    CLAUDE_CODE: {
      ...blocked('CLAUDE_CODE'),
      state: 'sign_in',
      reason: 'Claude Code needs your sign-in.',
      connectionStatus: { state: 'connected' },
    },
  })
  render(
    await AgentSetupPage({
      searchParams: Promise.resolve({ project: 'project-1', provider: 'CLAUDE_CODE', returnTo: draftHref }),
    }),
  )
  expect(screen.getByText('Claude Code sign-in controls')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Continue your brief' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Use Codex for this brief' })).toHaveAttribute(
    'href',
    `${draftHref}&assistant=CODEX`,
  )
})

it('does not send a blocked Codex user to the unrelated diagnostic as a cure', async () => {
  setReadiness({ CODEX: blocked('CODEX'), CLAUDE_CODE: ready('CLAUDE_CODE') })
  render(
    await AgentSetupPage({
      searchParams: Promise.resolve({ project: 'project-1', provider: 'CODEX', returnTo: draftHref }),
    }),
  )
  expect(screen.queryByRole('link', { name: 'Continue your brief' })).not.toBeInTheDocument()
  expect(screen.getByText(/cannot be enabled from this page/)).toBeInTheDocument()
  expect(screen.queryByText(/diagnostic|MCP|APPRAISE_|server owner/i)).not.toBeInTheDocument()
})

it('refuses a cross-project return and keeps a safe project-scoped path', async () => {
  setReadiness({ CODEX: blocked('CODEX'), CLAUDE_CODE: blocked('CLAUDE_CODE') })
  render(
    await AgentSetupPage({
      searchParams: Promise.resolve({
        project: 'project-1',
        provider: 'CODEX',
        returnTo: '/quality-journeys/drafts/draft-2?project=other-project',
      }),
    }),
  )
  expect(screen.getAllByRole('link', { name: 'Return to your brief' })[0]).toHaveAttribute(
    'href',
    '/quality-journeys/new?project=project-1',
  )
})
