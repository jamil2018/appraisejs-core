import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ inspectCodex: vi.fn(), claudeStatus: vi.fn() }))

vi.mock('@/lib/quality-journey/codex-app-server/managed-analysis-sender', () => ({
  inspectManagedCodexPrerequisites: mocks.inspectCodex,
}))
vi.mock('@/services/provider-connection/claude-code-connection-service', () => ({
  getClaudeCodeConnection: mocks.claudeStatus,
}))

import { getManagedJourneyProviderReadiness } from './app-managed-journey-readiness'

const scope = {
  targetProjectId: 'project-1',
  returnTo: '/quality-journeys/new?project=project-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const name of [
    'APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED',
    'APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED',
    'APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED',
    'APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED',
    'APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED',
  ])
    vi.stubEnv(name, 'true')
  mocks.inspectCodex.mockResolvedValue({ usableForDispatch: true, state: 'candidate' })
  mocks.claudeStatus.mockResolvedValue({ state: 'connected' })
})
afterEach(() => vi.unstubAllEnvs())

it('reports both providers ready only after their read-only preflights pass', async () => {
  const result = await getManagedJourneyProviderReadiness(scope)
  expect(result.CODEX.ready).toBe(true)
  expect(result.CLAUDE_CODE.ready).toBe(true)
  expect(mocks.inspectCodex).toHaveBeenCalledOnce()
  expect(mocks.claudeStatus).toHaveBeenCalledOnce()
})

it('withholds Codex when any Journey role is unavailable without probing or exposing configuration', async () => {
  vi.stubEnv('APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED', 'false')
  const result = await getManagedJourneyProviderReadiness(scope)
  expect(result.CODEX).toMatchObject({ ready: false, state: 'unavailable', actionLabel: 'See options' })
  expect(result.CODEX.reason).not.toMatch(/APPRAISE_|server|CLI/i)
  expect(mocks.inspectCodex).not.toHaveBeenCalled()
})

it('routes an observed Claude sign-in need to guided setup and keeps Codex availability separate', async () => {
  mocks.claudeStatus.mockResolvedValue({ state: 'disconnected' })
  const result = await getManagedJourneyProviderReadiness(scope)
  expect(result.CODEX.ready).toBe(true)
  expect(result.CLAUDE_CODE).toMatchObject({
    ready: false,
    state: 'sign_in',
    actionLabel: 'Sign in to Claude Code',
  })
  expect(result.CLAUDE_CODE.settingsHref).toContain('/settings/agent-setup?')
  expect(result.CLAUDE_CODE.settingsHref).toContain('provider=CLAUDE_CODE')
  expect(result.CLAUDE_CODE.settingsHref).toContain('returnTo=')
})

it('refuses stale or invalid Codex credential metadata without reading credential bytes', async () => {
  mocks.inspectCodex.mockResolvedValueOnce({ usableForDispatch: false, state: 'credential_missing' })
  const result = await getManagedJourneyProviderReadiness(scope)
  expect(result.CODEX.ready).toBe(false)
  expect(result.CODEX.state).toBe('sign_in')
  expect(result.CODEX.actionLabel).toBe('Sign in to Codex')
  expect(result.CODEX.reason).not.toContain('auth.json')
})
