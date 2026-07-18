// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AgentPreflightReceiptSummary } from '@/lib/agent-preflight/contracts'

import ProjectManagement from './project-management'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/target-project/target-project-actions', () => ({
  deleteTargetProjectAction: vi.fn(),
  registerTargetProjectAction: vi.fn(),
  renameTargetProjectAction: vi.fn(),
  selectTargetProjectAction: vi.fn(),
}))

const receipt: AgentPreflightReceiptSummary = {
  id: 'receipt-1',
  coordinatorId: 'codex-task',
  status: 'blocked',
  ready: false,
  snapshotHash: 'sha256:receipt',
  targetProjectId: 'target-1',
  observedAt: new Date('2026-07-18T03:01:00.000Z'),
  mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
  mcpServerStartedAt: new Date('2026-07-18T03:00:00.000Z'),
  preflight: {
    schemaVersion: 'appraise.agent-preflight/v1',
    status: 'blocked',
    ready: false,
    layers: {
      applicationAndIdentity: { status: 'ready', checks: [{ id: 'application', status: 'ok' }] },
      activeMcpTransport: {
        status: 'ready',
        message: 'The request reached Appraise.',
        serverStartedAt: '2026-07-18T03:00:00.000Z',
        mcpSurfaceVersion: '2026-07-18.unified-agent-preflight',
      },
      currentTaskCapabilities: {
        status: 'blocked',
        tools: { status: 'blocked', missing: ['planning_session_create'] },
        resources: { status: 'blocked', missing: ['appraise://workflow/planning'] },
        message: 'The task snapshot is stale.',
      },
      targetProjectBinding: {
        status: 'ready',
        expectedCanonicalPath: '/targets/notes',
        matchedScope: 'target',
        message: 'The target is registered.',
      },
    },
  },
}

describe('ProjectManagement agent readiness', () => {
  it('shows the durable four-layer receipt and exact missing capabilities', async () => {
    const user = userEvent.setup()
    render(
      <ProjectManagement
        projects={[
          {
            id: 'target-1',
            displayName: 'Notes',
            description: null,
            canonicalPath: '/targets/notes',
            lastDetectedAt: new Date('2026-07-18T02:00:00.000Z'),
            preflight: receipt,
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /blocked/i }))

    expect(screen.getByRole('dialog', { name: 'Agent preflight receipt' })).toBeInTheDocument()
    expect(screen.getByText('Application and identity')).toBeInTheDocument()
    expect(screen.getByText('Active MCP transport')).toBeInTheDocument()
    expect(screen.getByText('Current task capabilities')).toBeInTheDocument()
    expect(screen.getByText('Target project binding')).toBeInTheDocument()
    expect(screen.getByText(/planning_session_create/)).toBeInTheDocument()
    expect(screen.getByText(/appraise:\/\/workflow\/planning/)).toBeInTheDocument()
  })
})
