import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  saved: vi.fn(),
  correction: vi.fn(),
  recover: vi.fn(),
  issue: vi.fn(),
  schedule: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-analysis-correction', () => ({
  getAppManagedAnalysisCorrection: mocks.correction,
  issueAppManagedAnalysisCorrection: mocks.issue,
}))
vi.mock('@/services/coordinator/app-managed-analysis-retained-recovery', () => ({
  getAppManagedAnalysisRetainedRecovery: mocks.saved,
  recoverAppManagedAnalysisRetained: mocks.recover,
}))
vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  scheduleAppManagedJourneyContinuation: mocks.schedule,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { readJourneyAnalysisRecovery, resumeJourneyAnalysis } from './quality-journey-analysis-recovery-actions'
const hash = 'sha256:' + '1'.repeat(64)
const scope = { journeyId: 'journey', expectedStateHash: hash }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.project.mockResolvedValue({ id: 'project' })
})
it('recovers an existing proposal first and schedules no new worker', async () => {
  const retained = { attemptId: 'attempt', candidateHash: hash }
  mocks.saved.mockResolvedValue(retained)
  const recovery = await readJourneyAnalysisRecovery(scope)
  expect(recovery).toEqual({ kind: 'saved', ...retained })
  expect(mocks.correction).not.toHaveBeenCalled()
  expect(await resumeJourneyAnalysis({ ...scope, recovery })).toMatchObject({ success: true })
  expect(mocks.recover).toHaveBeenCalledWith({ ...scope, targetProjectId: 'project', ...retained })
  expect(mocks.schedule).not.toHaveBeenCalled()
})
it('wakes a replacement only after successful issuance', async () => {
  const failed = { attemptId: 'old', failureHash: hash }
  mocks.correction.mockResolvedValue(failed)
  const recovery = await readJourneyAnalysisRecovery(scope)
  mocks.issue.mockRejectedValueOnce(new Error('invalid assignment'))
  expect(await resumeJourneyAnalysis({ ...scope, recovery })).toMatchObject({ success: false })
  expect(mocks.schedule).not.toHaveBeenCalled()
  const successorHash = 'sha256:' + '2'.repeat(64)
  mocks.issue.mockResolvedValue({ expectedStateHash: successorHash })
  expect(await resumeJourneyAnalysis({ ...scope, recovery })).toMatchObject({ success: true })
  expect(mocks.issue).toHaveBeenCalledWith({ ...scope, targetProjectId: 'project', ...failed })
  expect(mocks.schedule).toHaveBeenCalledTimes(1)
  expect(mocks.schedule).toHaveBeenCalledWith({
    ...scope,
    expectedStateHash: successorHash,
    targetProjectId: 'project',
  })
})
it('rejects caller-supplied project identity', async () => {
  expect(
    await resumeJourneyAnalysis({
      ...scope,
      targetProjectId: 'other',
      recovery: { kind: 'replacement', attemptId: 'a', failureHash: hash },
    }),
  ).toMatchObject({ success: false })
  expect(mocks.project).not.toHaveBeenCalled()
})
