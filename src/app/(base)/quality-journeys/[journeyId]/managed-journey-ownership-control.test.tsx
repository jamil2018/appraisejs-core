import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  register: vi.fn(),
  adopt: vi.fn(),
  transfer: vi.fn(),
  project: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-session-service', () => ({
  readLegacyQualityJourneyMigrationSnapshot: mocks.snapshot,
  registerQualityJourneyCoordinatorSession: mocks.register,
  adoptUnownedLegacyQualityJourneyCoordinatorSession: mocks.adopt,
  transferQualityJourneyCoordinatorSession: mocks.transfer,
}))
import { ServiceError } from '@/services/shared/errors'
import { ManagedJourneyOwnershipControl } from './managed-journey-ownership-control'

const snapshot = {
  mode: 'TRANSFER',
  blocker: null,
  reconciliationReceiptId: 'pause-cleanup-exact',
  expectedVersion: 7,
  expectedOwnershipVersion: 3,
  expectedStateHash: 'exact-reviewed-hash',
  adoptionSnapshotHash: 'exact-adoption-hash',
  predecessorSessionId: 'old-desktop-owner',
  predecessorGeneration: 9,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.snapshot.mockResolvedValue(snapshot)
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.register.mockResolvedValue({ session: { id: 'new-local-owner' } })
  mocks.adopt.mockResolvedValue({ current: true })
  mocks.transfer.mockResolvedValue({ current: true })
})

describe('in-place legacy ownership migration control', () => {
  it('uses the exact reviewed predecessor, generation, state and cleanup for an already-owned Journey', async () => {
    const view = await ManagedJourneyOwnershipControl({ journeyId: 'journey-1', projectId: 'target-1' })
    expect(view.props.previouslyOwned).toBe(true)
    await expect(view.props.adopt()).resolves.toBeNull()
    expect(mocks.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        coordinatorPrincipalId: 'appraise-local:target-1',
        predecessorSessionId: 'old-desktop-owner',
        predecessorGeneration: 9,
        successorSessionId: 'new-local-owner',
        expectedStateHash: 'exact-reviewed-hash',
        expectedOwnershipVersion: 3,
        reconciliationReceiptId: 'pause-cleanup-exact',
        targetHostingMode: 'APP_SERVER_LOCAL_V1',
      }),
    )
    expect(mocks.adopt).not.toHaveBeenCalled()
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('retains exact adoption checks for a never-owned Journey', async () => {
    mocks.snapshot.mockResolvedValue({
      ...snapshot,
      mode: 'ADOPT',
      predecessorSessionId: null,
      predecessorGeneration: null,
    })
    const view = await ManagedJourneyOwnershipControl({ journeyId: 'journey-1', projectId: 'target-1' })
    await view.props.adopt()
    expect(mocks.adopt).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 7, expectedAdoptionSnapshotHash: 'exact-adoption-hash' }),
    )
    expect(mocks.transfer).not.toHaveBeenCalled()
  })
  it('shows the canonical blocker without registering a successor or attempting a transition', async () => {
    mocks.snapshot.mockResolvedValue({
      ...snapshot,
      blocker: 'Coordinator transfer requires reconciled quiescence; active or unknown work remains.',
    })
    const view = await ManagedJourneyOwnershipControl({ journeyId: 'journey-1', projectId: 'target-1' })
    expect(view.props.role).toBe('status')
    expect(view.props.children).toContain('active or unknown work remains')
    expect(mocks.register).not.toHaveBeenCalled()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })
  it('surfaces a canonical stale-generation refusal and blocks a changed active project', async () => {
    mocks.transfer.mockRejectedValue(
      new ServiceError('Coordinator approval snapshot changed; obtain a fresh explicit decision.', 'CONFLICT'),
    )
    const view = await ManagedJourneyOwnershipControl({ journeyId: 'journey-1', projectId: 'target-1' })
    expect(await view.props.adopt()).toContain('snapshot changed')
    mocks.project.mockResolvedValue({ id: 'other-project' })
    mocks.register.mockClear()
    expect(await view.props.adopt()).toContain('original project')
    expect(mocks.register).not.toHaveBeenCalled()
  })
})
