import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ project: vi.fn(), read: vi.fn(), schedule: vi.fn(), captureStatus: vi.fn() }))
vi.mock('@/services/coordinator/app-managed-discovery-capture', () => ({
  getAppManagedAnonymousDiscoveryCaptureStatus: mocks.captureStatus,
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  readAppManagedJourneyContinuation: mocks.read,
  scheduleAppManagedJourneyContinuation: mocks.schedule,
}))
import { ServiceError } from '@/services/shared/errors'
import { continueQualityJourneyManagedAction } from './quality-journey-managed-progression-actions'
const input = { journeyId: 'journey', expectedStateHash: `sha256:${'a'.repeat(64)}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'active-project' })
  mocks.captureStatus.mockResolvedValue('MANUAL_REQUIRED')
  mocks.read.mockResolvedValue({ role: 'REQUIREMENT_ANALYZER' })
})
describe('managed continuation action', () => {
  it('uses the mutation-scoped active project and returns without waiting for the worker', async () => {
    expect(await continueQualityJourneyManagedAction(input)).toMatchObject({ success: true, data: { scheduled: true } })
    expect(mocks.read).toHaveBeenCalledWith({ ...input, targetProjectId: 'active-project' })
    expect(mocks.schedule).toHaveBeenCalledWith({ ...input, targetProjectId: 'active-project' })
  })
  it('rejects client-supplied scope or role authority', async () => {
    expect(
      await continueQualityJourneyManagedAction({ ...input, targetProjectId: 'other-project', role: 'TRIAGER' }),
    ).toMatchObject({ status: 400 })
    expect(mocks.project).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('does not wake work that is waiting at a gate or already consumed', async () => {
    mocks.read.mockResolvedValue(null)
    expect(await continueQualityJourneyManagedAction(input)).toMatchObject({
      success: true,
      data: { scheduled: false },
    })
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('preserves mutation admission failures', async () => {
    mocks.project.mockRejectedValue(new ServiceError('Project scope changed.', 'CONFLICT'))
    expect(await continueQualityJourneyManagedAction(input)).toMatchObject({ success: false, status: 409 })
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
})
