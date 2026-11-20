import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  start: vi.fn(),
  revalidate: vi.fn(),
  reconcile: vi.fn(),
  scout: vi.fn(),
  retry: vi.fn(),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-discovery-service', () => ({ startAppManagedDiscovery: mocks.start }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/app-managed-discovery-correction', () => ({
  requestAppManagedExplorerCorrection: mocks.reconcile,
  requestAppManagedScoutCorrection: mocks.scout,
  createAppManagedDiscoveryCorrection: mocks.retry,
}))
import {
  startQualityJourneyManagedDiscoveryAction,
  requestQualityJourneyExplorerCorrectionAction,
  requestQualityJourneyScoutCorrectionAction,
  createQualityJourneyDiscoveryCorrectionAction,
} from './quality-journey-managed-discovery-actions'
const input = { journeyId: 'journey-1', expectedStateHash: `sha256:${'a'.repeat(64)}`, role: 'SCOUT' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.start.mockResolvedValue({ discoveryRevisionId: 'discovery-1', accepted: true })
})

describe('managed Discovery server action', () => {
  it('scopes both correction steps to the server-owned project and rejects client authority fields', async () => {
    const correction = { journeyId: input.journeyId, expectedStateHash: input.expectedStateHash }
    for (const [action, service] of [
      [requestQualityJourneyExplorerCorrectionAction, mocks.reconcile],
      [requestQualityJourneyScoutCorrectionAction, mocks.scout],
      [createQualityJourneyDiscoveryCorrectionAction, mocks.retry],
    ] as const) {
      await expect(action({ ...correction, targetProjectId: 'other' })).resolves.toMatchObject({
        success: false,
        status: 400,
      })
      expect(service).not.toHaveBeenCalled()
      service.mockResolvedValue({ replayed: false, discoveryRevision: { id: 'fresh-discovery' } })
      await expect(action(correction)).resolves.toMatchObject({ success: true, status: 200 })
      expect(service).toHaveBeenCalledWith({ ...correction, targetProjectId: 'project-1' })
    }
  })
  it('resolves project ownership on the server and refreshes the canonical Journey after publication', async () => {
    await expect(startQualityJourneyManagedDiscoveryAction(input)).resolves.toMatchObject({
      success: true,
      status: 200,
    })
    expect(mocks.start).toHaveBeenCalledWith({ ...input, targetProjectId: 'project-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('rejects client-supplied project and credential fields before orchestration', async () => {
    await expect(
      startQualityJourneyManagedDiscoveryAction({ ...input, targetProjectId: 'other' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('preserves canonical conflict classification', async () => {
    mocks.start.mockRejectedValueOnce(new ServiceError('Original dispatch is UNKNOWN.', 'CONFLICT'))
    await expect(startQualityJourneyManagedDiscoveryAction(input)).resolves.toMatchObject({
      success: false,
      status: 409,
      error: 'Original dispatch is UNKNOWN.',
    })
  })
})
