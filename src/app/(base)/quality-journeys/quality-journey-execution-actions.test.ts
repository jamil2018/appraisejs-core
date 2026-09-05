import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ project: vi.fn(), run: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/quality-journey-execution-service', () => ({
  startQualityJourneyExecution: mocks.run,
  cancelQualityJourneyExecution: mocks.run,
  reconcileQualityJourneyExecution: mocks.run,
  proposeQualityJourneyRerun: mocks.run,
  startQualityJourneyRerun: mocks.run,
  grantQualityJourneyExecutionConsent: mocks.run,
  approveQualityJourneyRerun: mocks.run,
}))
import { qualityJourneyExecutionAction } from './quality-journey-execution-actions'
const input = { journeyId: 'journey-1', executionConsentId: 'consent-1', expectedScopeHash: `sha256:${'a'.repeat(64)}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.run.mockResolvedValue({ status: 'GRANTED' })
})
describe('Journey execution UI authority', () => {
  it('resolves grant ownership from active project and invalidates the Journey', async () => {
    expect(await qualityJourneyExecutionAction('consent', input)).toMatchObject({ success: true })
    expect(mocks.run).toHaveBeenCalledWith({ ...input, targetProjectId: 'target-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it.each([{ actor: 'USER' }, { targetProjectId: 'forged' }, { grantSource: 'UI' }])(
    'rejects browser-supplied authority',
    async injected => {
      expect(await qualityJourneyExecutionAction('consent', { ...input, ...injected })).toMatchObject({
        success: false,
      })
      expect(mocks.run).not.toHaveBeenCalled()
    },
  )
})
