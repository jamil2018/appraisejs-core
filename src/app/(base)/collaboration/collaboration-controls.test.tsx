// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), handoff: vi.fn(), cancel: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/actions/repository-collaboration/collaboration-actions', () => ({
  cancelCollaborationAction: mocks.cancel,
  connectCollaborationAction: vi.fn(),
  createCollaborationHandoffAction: mocks.handoff,
  decideCollaborationAction: vi.fn(),
  executeCollaborationAction: vi.fn(),
  prepareCollaborationAction: vi.fn(),
  recoverCollaborationFilesystemAction: vi.fn(),
  updateCollaborationPolicyAction: vi.fn(),
}))

import { CollaborationControls } from './collaboration-controls'

const status = {
  id: 'binding-1',
  portableProjectId: 'portable-project',
  remoteName: 'origin',
  trackedBranch: 'appraise-0.5',
  enabled: true,
  policyVersion: 1,
  connectionState: 'OFFLINE',
  connection: {
    mode: 'INTERACTIVE_HANDOFF',
    workerAvailable: false,
    nativeWakeSupported: false,
    observedCapabilities: [],
    workers: [],
  },
  lastObservedAt: null,
  lastRemoteCheckAt: null,
  grants: [{ permission: 'PREPARE', enabled: true }],
  notifications: [{ id: 'notice-1', kind: 'remote-failure', message: 'Repair credentials.', actionable: true }],
  operations: [
    {
      id: 'operation-1',
      intent: 'RECEIVE',
      trigger: 'test',
      state: 'WAITING_FOR_AGENT',
      version: 1,
      idempotencyKey: 'operation-1',
      sourceRevision: null,
      targetRevision: null,
      preparedDigest: 'digest',
      acceptedDigest: null,
      blocker: null,
      receiptHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      decisions: [],
      changeCount: 0,
      decisionCount: 0,
      reviewItems: [],
    },
  ],
} as never

describe('CollaborationControls', () => {
  it('shows honest offline handoff status and exposes one prepared token without claiming native wake', async () => {
    mocks.handoff.mockResolvedValue({
      success: true,
      data: {
        token: 'one-time-token',
        bootstrap: 'Appraise collaboration handoff token: one-time-token',
        expiresAt: '2026-09-09T01:00:00.000Z',
      },
    })
    const user = userEvent.setup()
    render(<CollaborationControls projectId="project-1" status={status} />)

    expect(screen.getByText(/No worker is currently available/i)).toBeInTheDocument()
    expect(screen.getByText('Repair credentials.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue with agent' }))
    expect(await screen.findByText('one-time-token')).toBeInTheDocument()
    expect(screen.getByText(/does not wake or launch an agent/i)).toBeInTheDocument()
    expect(mocks.handoff).toHaveBeenCalledWith({ targetProjectId: 'project-1', operationId: 'operation-1' })
  })
})
