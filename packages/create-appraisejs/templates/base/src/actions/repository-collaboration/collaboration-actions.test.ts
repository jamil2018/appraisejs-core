import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireActiveProjectForMutation: vi.fn(),
  connectCollaboration: vi.fn(),
  continueAcceptedCollaborationOperation: vi.fn(),
  decideCollaborationOperation: vi.fn(),
  decideDivergentCollaborationProposal: vi.fn(),
  cancelCollaborationOperation: vi.fn(),
  collaborationPublicDigest: (value: string | null) => (value ? `sha256:${value}` : null),
  createCollaborationHandoffTicket: vi.fn(),
  issueCollaborationAuthorityReceipt: vi.fn(),
  getCollaborationStatus: vi.fn(),
  getSanitizedCollaborationAssignment: vi.fn(),
  prepareCollaborationOperation: vi.fn(),
  recoverCollaborationOperationFilesystem: vi.fn(),
  retryCollaborationRemoteCheck: vi.fn(),
  requireCollaborationOperationForProject: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.requireActiveProjectForMutation }))
vi.mock('@/services/repository-collaboration', () => ({
  connectCollaboration: mocks.connectCollaboration,
  cancelCollaborationOperation: mocks.cancelCollaborationOperation,
  collaborationPublicDigest: mocks.collaborationPublicDigest,
  createCollaborationHandoffTicket: mocks.createCollaborationHandoffTicket,
  decideCollaborationOperation: mocks.decideCollaborationOperation,
  decideDivergentCollaborationProposal: mocks.decideDivergentCollaborationProposal,
  continueAcceptedCollaborationOperation: mocks.continueAcceptedCollaborationOperation,
  executeCollaborationOperation: vi.fn(),
  getCollaborationStatus: mocks.getCollaborationStatus,
  getSanitizedCollaborationAssignment: mocks.getSanitizedCollaborationAssignment,
  prepareCollaborationOperation: mocks.prepareCollaborationOperation,
  requireCollaborationOperationForProject: mocks.requireCollaborationOperationForProject,
  recoverCollaborationOperationFilesystem: mocks.recoverCollaborationOperationFilesystem,
  retryCollaborationRemoteCheck: mocks.retryCollaborationRemoteCheck,
  updateCollaborationPolicy: vi.fn(),
  updateCollaborationPolicyFromLocalUi: vi.fn(),
  issueCollaborationAuthorityReceipt: mocks.issueCollaborationAuthorityReceipt,
}))

import {
  connectCollaborationAction,
  cancelCollaborationAction,
  createCollaborationHandoffAction,
  issueCollaborationAuthorityReceiptAction,
  prepareCollaborationAction,
  recoverCollaborationFilesystemAction,
  decideCollaborationAction,
  decideDivergentCollaborationProposalAction,
  retryCollaborationRemoteCheckAction,
} from './collaboration-actions'

const projectId = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActiveProjectForMutation.mockResolvedValue({
    id: projectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalPath: '/workspace/project',
  })
  mocks.connectCollaboration.mockResolvedValue({ id: 'binding-1' })
  mocks.getCollaborationStatus.mockResolvedValue({ id: 'binding-1', policyVersion: 3 })
  mocks.prepareCollaborationOperation.mockResolvedValue({ id: 'operation-1' })
  mocks.recoverCollaborationOperationFilesystem.mockResolvedValue({ status: 'recovered' })
  mocks.decideCollaborationOperation.mockResolvedValue({ id: 'operation-1', state: 'READY' })
  mocks.decideDivergentCollaborationProposal.mockResolvedValue({ id: 'operation-1', state: 'READY' })
  mocks.continueAcceptedCollaborationOperation.mockResolvedValue({ id: 'operation-1', state: 'COMPLETED' })
  mocks.retryCollaborationRemoteCheck.mockResolvedValue({ id: 'binding-1' })
  mocks.cancelCollaborationOperation.mockResolvedValue({ id: 'operation-1', state: 'CANCELLED' })
  mocks.createCollaborationHandoffTicket.mockResolvedValue({
    ticket: { expiresAt: new Date('2026-09-09T01:00:00.000Z') },
    token: 'single-use-token',
  })
  mocks.getSanitizedCollaborationAssignment.mockResolvedValue({
    schema: 'appraise.repository-collaboration.worker-assignment/v1',
    operationId: 'clx00000000000000000000000',
  })
  mocks.issueCollaborationAuthorityReceipt.mockResolvedValue({
    token: 'a'.repeat(43),
    expiresAt: new Date('2026-09-09T01:00:00.000Z'),
  })
})

describe('collaboration actions', () => {
  it('derives the repository root and trusted principal from the active project', async () => {
    await expect(
      connectCollaborationAction({ targetProjectId: projectId, trackedBranch: 'appraise-0.5', remoteName: 'origin' }),
    ).resolves.toMatchObject({ success: true })

    expect(mocks.connectCollaboration).toHaveBeenCalledWith({
      targetProjectId: projectId,
      repositoryRoot: '/workspace/project',
      trackedBranch: 'appraise-0.5',
      remoteName: 'origin',
      trustedPrincipalId: 'local-user',
      provenance: 'local-ui',
    })
  })

  it('uses the binding and policy resolved inside the active project scope', async () => {
    await expect(
      prepareCollaborationAction({
        targetProjectId: projectId,
        intent: 'PUBLISH',
        idempotencyKey: 'publish-1',
      }),
    ).resolves.toMatchObject({ success: true })

    expect(mocks.prepareCollaborationOperation).toHaveBeenCalledWith({
      bindingId: 'binding-1',
      intent: 'PUBLISH',
      idempotencyKey: 'publish-1',
      expectedPolicyVersion: 3,
      trigger: 'local-ui',
    })
  })

  it('continues standard and accepted divergent decisions without exposing individual Git steps', async () => {
    const standard = {
      targetProjectId: projectId,
      operationId: 'operation-1',
      expectedVersion: 2,
      preparedDigest: `sha256:${'a'.repeat(64)}`,
    }
    await expect(
      decideCollaborationAction({ ...standard, decisions: [{ recordKey: 'module:one', decision: 'USE_INCOMING' }] }),
    ).resolves.toMatchObject({ success: true, data: { state: 'COMPLETED' } })
    await expect(
      decideDivergentCollaborationProposalAction({
        ...standard,
        reviewDigest: `sha256:${'b'.repeat(64)}`,
        decision: 'ACCEPT',
      }),
    ).resolves.toMatchObject({ success: true, data: { state: 'COMPLETED' } })
    expect(mocks.continueAcceptedCollaborationOperation).toHaveBeenCalledTimes(2)
    expect(mocks.continueAcceptedCollaborationOperation).toHaveBeenNthCalledWith(1, { operationId: 'operation-1' })
  })

  it('offers only a local binding-scoped retry for an authentication repair pause', async () => {
    await expect(retryCollaborationRemoteCheckAction({ targetProjectId: projectId })).resolves.toMatchObject({
      success: true,
    })
    expect(mocks.retryCollaborationRemoteCheck).toHaveBeenCalledWith({ bindingId: 'binding-1' })
  })

  it('issues a CLI handoff for the canonical full policy request without accepting a caller target', async () => {
    await expect(
      issueCollaborationAuthorityReceiptAction({
        action: 'POLICY_UPDATE',
        targetProjectId: projectId,
        changes: { INTEGRATE: true },
      }),
    ).resolves.toMatchObject({ success: true, data: { token: 'a'.repeat(43) } })
    expect(mocks.issueCollaborationAuthorityReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: 'binding-1',
        action: 'POLICY_UPDATE',
        request: { target: projectId, expectedPolicyVersion: 3, changes: { INTEGRATE: true } },
      }),
    )
  })

  it('rejects caller-supplied receive records instead of bypassing the repository fetch', async () => {
    await expect(
      prepareCollaborationAction({
        targetProjectId: projectId,
        intent: 'RECEIVE',
        idempotencyKey: 'receive-1',
        incomingRecords: [],
      }),
    ).resolves.toMatchObject({ success: false })

    expect(mocks.prepareCollaborationOperation).not.toHaveBeenCalled()
  })

  it('requires the operation to belong to the active project before recovery', async () => {
    await expect(
      recoverCollaborationFilesystemAction({ targetProjectId: projectId, operationId: 'clx00000000000000000000000' }),
    ).resolves.toMatchObject({ success: true })

    expect(mocks.requireCollaborationOperationForProject).toHaveBeenCalledWith('clx00000000000000000000000', projectId)
    expect(mocks.recoverCollaborationOperationFilesystem).toHaveBeenCalledWith('clx00000000000000000000000')
  })

  it('creates a project-scoped interactive handoff without claiming that a worker was launched', async () => {
    mocks.requireCollaborationOperationForProject.mockResolvedValue({
      id: 'clx00000000000000000000000',
      preparedDigest: 'a'.repeat(64),
    })
    await expect(
      createCollaborationHandoffAction({ targetProjectId: projectId, operationId: 'clx00000000000000000000000' }),
    ).resolves.toMatchObject({ success: true, data: { token: 'single-use-token' } })

    expect(mocks.createCollaborationHandoffTicket).toHaveBeenCalledWith({
      bindingId: 'binding-1',
      operationId: 'clx00000000000000000000000',
      scope: {
        assignment: {
          schema: 'appraise.repository-collaboration.worker-assignment/v1',
          operationId: 'clx00000000000000000000000',
        },
      },
    })
  })

  it('cancels only the operation proved to belong to the active project', async () => {
    await expect(
      cancelCollaborationAction({ targetProjectId: projectId, operationId: 'clx00000000000000000000000' }),
    ).resolves.toMatchObject({ success: true })
    expect(mocks.cancelCollaborationOperation).toHaveBeenCalledWith({
      operationId: 'clx00000000000000000000000',
      reason: 'Cancelled from Collaboration.',
    })
  })
})
