import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  run: vi.fn(),
  revalidate: vi.fn(),
  get: vi.fn(),
  schedule: vi.fn(),
}))
vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  scheduleAppManagedJourneyContinuation: mocks.schedule,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: mocks.get }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/quality-journey-execution-service', () => ({
  startQualityJourneyExecution: mocks.run,
  cancelQualityJourneyExecution: mocks.run,
  reconcileQualityJourneyExecution: mocks.run,
  proposeQualityJourneyRerun: mocks.run,
  startQualityJourneyRerun: mocks.run,
  grantQualityJourneyExecutionConsent: mocks.run,
  revokeQualityJourneyExecutionConsent: mocks.run,
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
  it('wakes role work after canonical execution reconciliation using the newly committed state', async () => {
    mocks.get.mockResolvedValue({ journey: { stateHash: 'fresh-state' } })
    expect(
      await qualityJourneyExecutionAction('reconcile', {
        journeyId: 'journey-1',
        cycleId: 'cycle-1',
        idempotencyKey: 'reconcile-1',
      }),
    ).toMatchObject({ success: true })
    expect(mocks.schedule).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      expectedStateHash: 'fresh-state',
    })
  })
  it('resolves grant ownership from active project and invalidates the Journey', async () => {
    expect(await qualityJourneyExecutionAction('consent', input)).toMatchObject({ success: true })
    expect(mocks.run).toHaveBeenCalledWith(
      { ...input, targetProjectId: 'target-1' },
      undefined,
      trustedHumanCoordinatorSession,
    )
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('resolves revocation ownership from the active project', async () => {
    expect(await qualityJourneyExecutionAction('revokeConsent', input)).toMatchObject({ success: true })
    expect(mocks.run).toHaveBeenCalledWith(
      { ...input, targetProjectId: 'target-1' },
      undefined,
      trustedHumanCoordinatorSession,
    )
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
