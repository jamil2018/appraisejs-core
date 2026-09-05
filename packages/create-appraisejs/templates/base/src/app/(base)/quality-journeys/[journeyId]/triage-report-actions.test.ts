import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ approve: vi.fn(), project: vi.fn(), revalidate: vi.fn(), revision: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/quality-journey-triage-service', () => ({
  approveQualityJourneyRemediation: mocks.approve,
  requestQualityJourneyReportRevision: mocks.revision,
}))

import { qualityJourneyTriageReviewAction } from './triage-report-actions'

const input = {
  journeyId: 'journey-1',
  reportRevisionId: 'report-1',
  expectedReportHash: `sha256:${'a'.repeat(64)}`,
  expectedStateHash: `sha256:${'b'.repeat(64)}`,
  idempotencyKey: 'review-1',
  feedback: 'Review the complete report.',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.revision.mockResolvedValue({ id: 'review-1' })
  mocks.approve.mockResolvedValue({ id: 'review-1' })
})

describe('Journey triage review UI authority', () => {
  it('binds a full-report revision request to the active project', async () => {
    expect(await qualityJourneyTriageReviewAction('revision', input)).toMatchObject({ success: true })
    expect(mocks.revision).toHaveBeenCalledWith({ ...input, targetProjectId: 'target-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('uses the same exact report review envelope for remediation approval', async () => {
    expect(await qualityJourneyTriageReviewAction('approve', input)).toMatchObject({ success: true })
    expect(mocks.approve).toHaveBeenCalledWith({ ...input, targetProjectId: 'target-1' })
  })
  it.each([{ actor: 'USER' }, { targetProjectId: 'forged' }, { feedbackScope: 'FULL_REPORT' }])(
    'rejects browser-supplied report authority',
    async injected => {
      expect(await qualityJourneyTriageReviewAction('revision', { ...input, ...injected })).toMatchObject({
        success: false,
      })
      expect(mocks.revision).not.toHaveBeenCalled()
    },
  )
})
