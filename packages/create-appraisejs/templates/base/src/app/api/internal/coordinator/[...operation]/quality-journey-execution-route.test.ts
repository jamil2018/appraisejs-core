import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ start: vi.fn(), resolve: vi.fn() }))
vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))
vi.mock('@/services/coordinator/quality-journey-execution-service', () => ({
  startQualityJourneyExecution: mocks.start,
  getQualityJourneyExecution: vi.fn(),
  cancelQualityJourneyExecution: vi.fn(),
  reconcileQualityJourneyExecution: vi.fn(),
  proposeQualityJourneyRerun: vi.fn(),
  startQualityJourneyRerun: vi.fn(),
}))
import { postQualityJourneyExecutionRoute } from './quality-journey-execution-route'
const path = ['quality', 'journeys', 'journey-1', 'execution', 'start']
beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'target-1' })
})
it.each(['actor', 'grantSource', 'journeyId', 'targetProjectId'])(
  'rejects caller authority or scope field %s before dispatch',
  async field => {
    await expect(postQualityJourneyExecutionRoute(path, { target: 'target', [field]: 'forged' })).rejects.toThrow(
      'resolved by Appraise',
    )
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.resolve).not.toHaveBeenCalled()
  },
)
it('does not expose a consent-grant route', async () => {
  expect(await postQualityJourneyExecutionRoute([...path.slice(0, 4), 'consent'], { target: 'target' })).toBeUndefined()
})
it('rejects malformed execution before calling the service', async () => {
  await expect(postQualityJourneyExecutionRoute(path, { target: 'target', environmentId: 'env' })).rejects.toThrow()
  expect(mocks.start).not.toHaveBeenCalled()
})
