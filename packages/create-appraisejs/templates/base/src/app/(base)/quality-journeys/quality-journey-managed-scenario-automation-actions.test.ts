import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  start: vi.fn(),
  recover: vi.fn(),
  correction: vi.fn(),
  revalidate: vi.fn(),
  getJourney: vi.fn(),
  schedule: vi.fn(),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-scenario-automation-service', () => ({
  startAppManagedScenarioAutomation: mocks.start,
}))
vi.mock('@/services/coordinator/app-managed-scenario-automation-recovery', () => ({
  recoverAppManagedScenarioAutomation: mocks.recover,
  requestAppManagedScenarioDesignCorrection: mocks.correction,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: mocks.getJourney }))
vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  scheduleAppManagedJourneyContinuation: mocks.schedule,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import {
  startQualityJourneyManagedScenarioAutomationAction,
  recoverQualityJourneyManagedScenarioAutomationAction,
  requestQualityJourneyManagedScenarioCorrectionAction,
} from './quality-journey-managed-scenario-automation-actions'
const input = { journeyId: 'journey-1', role: 'TEST_SCENARIO_DESIGNER', expectedStateHash: `sha256:${'a'.repeat(64)}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.getJourney.mockResolvedValue({ journey: { stateHash: `sha256:${'d'.repeat(64)}` } })
  mocks.start.mockResolvedValue({ accepted: true })
  mocks.recover.mockResolvedValue({ accepted: true, nativeSend: false })
})

describe('managed scenario/preparation server action', () => {
  it('resolves project ownership on the server and refreshes the canonical Journey after publication', async () => {
    await expect(startQualityJourneyManagedScenarioAutomationAction(input)).resolves.toMatchObject({
      success: true,
      status: 200,
    })
    expect(mocks.start).toHaveBeenCalledWith({ ...input, targetProjectId: 'project-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('rejects client-supplied project and credential fields before orchestration', async () => {
    await expect(
      startQualityJourneyManagedScenarioAutomationAction({ ...input, targetProjectId: 'other' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('preserves canonical conflict classification', async () => {
    mocks.start.mockRejectedValueOnce(new ServiceError('Original dispatch is UNKNOWN.', 'CONFLICT'))
    await expect(startQualityJourneyManagedScenarioAutomationAction(input)).resolves.toMatchObject({
      success: false,
      status: 409,
      error: 'Original dispatch is UNKNOWN.',
    })
  })
  it('keeps proposal recovery scoped to the active project and rejects caller-supplied proposal bodies', async () => {
    const recovery = { ...input, attemptId: 'attempt-1', candidateHash: `sha256:${'b'.repeat(64)}` }
    await expect(recoverQualityJourneyManagedScenarioAutomationAction(recovery)).resolves.toMatchObject({
      success: true,
      data: { nativeSend: false },
    })
    expect(mocks.recover).toHaveBeenCalledWith({ ...recovery, targetProjectId: 'project-1' })
    await expect(
      recoverQualityJourneyManagedScenarioAutomationAction({ ...recovery, candidate: {} }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.recover).toHaveBeenCalledTimes(1)
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('issues a distinct correction through active-project scope without dispatching a native turn', async () => {
    const correction = {
      journeyId: input.journeyId,
      expectedStateHash: input.expectedStateHash,
      attemptId: 'attempt-1',
      expectedFailureHash: `sha256:${'c'.repeat(64)}`,
    }
    mocks.correction.mockResolvedValue({ successorAttempt: 2 })
    await expect(requestQualityJourneyManagedScenarioCorrectionAction(correction)).resolves.toMatchObject({
      success: true,
    })
    expect(mocks.correction).toHaveBeenCalledWith({ ...correction, targetProjectId: 'project-1' })
    expect(mocks.schedule).toHaveBeenCalledWith({
      journeyId: input.journeyId,
      targetProjectId: 'project-1',
      expectedStateHash: `sha256:${'d'.repeat(64)}`,
    })
    expect(mocks.start).not.toHaveBeenCalled()
    await expect(
      requestQualityJourneyManagedScenarioCorrectionAction({ ...correction, targetProjectId: 'other' }),
    ).resolves.toMatchObject({ status: 400 })
  })

  it('preserves issued correction success if its opportunistic wake cannot register', async () => {
    mocks.correction.mockResolvedValue({ successorAttempt: 2 })
    mocks.schedule.mockImplementationOnce(() => {
      throw new Error('No request context')
    })
    await expect(
      requestQualityJourneyManagedScenarioCorrectionAction({
        journeyId: input.journeyId,
        expectedStateHash: input.expectedStateHash,
        attemptId: 'attempt-1',
        expectedFailureHash: `sha256:${'c'.repeat(64)}`,
      }),
    ).resolves.toMatchObject({ success: true, data: { successorAttempt: 2 } })
    expect(mocks.start).not.toHaveBeenCalled()
  })
})
