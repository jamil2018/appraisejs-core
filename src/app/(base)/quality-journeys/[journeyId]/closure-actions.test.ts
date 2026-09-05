import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ close: vi.fn(), project: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/services/coordinator/quality-journey-closure-service', () => ({ closeQualityJourney: mocks.close }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { closeQualityJourneyAction } from './closure-actions'
import { ServiceError } from '@/services/shared/errors'
const input = {
  journeyId: 'journey-1',
  reportRevisionId: 'report-1',
  expectedReportHash: `sha256:${'a'.repeat(64)}`,
  expectedStateHash: `sha256:${'b'.repeat(64)}`,
  idempotencyKey: 'close-1',
  decision: 'CLOSED',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.close.mockResolvedValue({ receipt: {} })
})
it('resolves target scope and invalidates the closed journey views', async () => {
  expect(await closeQualityJourneyAction(input)).toMatchObject({ success: true })
  expect(mocks.close).toHaveBeenCalledWith({ ...input, acceptedItemIds: [], targetProjectId: 'project-1' })
  expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys')
})
it.each(['actorId', 'actor', 'targetProjectId'])('rejects client authority %s', async field => {
  expect(await closeQualityJourneyAction({ ...input, [field]: 'forged' })).toMatchObject({
    success: false,
    status: 400,
  })
  expect(mocks.close).not.toHaveBeenCalled()
})
it('maps stale report conflicts without revalidating', async () => {
  mocks.close.mockRejectedValue(new ServiceError('Stale report', 'CONFLICT'))
  expect(await closeQualityJourneyAction(input)).toMatchObject({ success: false, error: 'Stale report' })
  expect(mocks.revalidate).not.toHaveBeenCalled()
})
