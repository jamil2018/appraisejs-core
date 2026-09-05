import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  resolve: vi.fn(),
  submit: vi.fn(),
}))
vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))
vi.mock('@/services/coordinator/quality-journey-triage-service', () => ({
  getQualityJourneyTriage: mocks.get,
  prepareQualityJourneyTriage: mocks.prepare,
  submitQualityJourneyTriageReport: mocks.submit,
}))
vi.mock('@/services/coordinator/quality-journey-triage-evidence-service', () => ({
  readQualityJourneyTriageEvidence: mocks.evidence,
}))

import { getQualityJourneyTriageRoute, postQualityJourneyTriageRoute } from './quality-journey-triage-route'

const digest = `sha256:${'a'.repeat(64)}`
const path = ['quality', 'journeys', 'journey-1', 'triage', 'prepare']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'target-1' })
  mocks.prepare.mockResolvedValue({ assignments: [] })
  mocks.submit.mockResolvedValue({ reportRevisionId: 'report-1' })
  mocks.get.mockResolvedValue({ assignments: [], reports: [], activeReportRevisionId: null })
  mocks.evidence.mockResolvedValue({ receiptId: 'receipt-1', artifactKind: 'report', text: 'sealed report' })
})

it('resolves triage prepare scope from the target binding', async () => {
  const response = await postQualityJourneyTriageRoute(path, { target: 'target', executionCycleId: 'execution-1' })

  expect(mocks.prepare).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    executionCycleId: 'execution-1',
  })
  expect(response?.status).toBe(200)
})

it.each(['journeyId', 'targetProjectId', 'actor', 'feedbackScope'])(
  'rejects caller-supplied triage authority %s before target resolution',
  async field => {
    await expect(
      postQualityJourneyTriageRoute(path, { target: 'target', executionCycleId: 'execution-1', [field]: 'forged' }),
    ).rejects.toThrow('resolved by Appraise')
    expect(mocks.resolve).not.toHaveBeenCalled()
  },
)

it('reads only the triage context endpoint', async () => {
  const response = await getQualityJourneyTriageRoute(
    ['quality', 'journeys', 'journey-1', 'triage', 'context'],
    new URLSearchParams({ target: 'target' }),
  )

  expect(mocks.get).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'target-1' })
  expect(response?.status).toBe(200)
  expect(await getQualityJourneyTriageRoute([...path.slice(0, 4), 'revision'], new URLSearchParams())).toBeUndefined()
})

it('dereferences only a bounded artifact through target-scoped POST lease authority', async () => {
  const response = await postQualityJourneyTriageRoute(['quality', 'journeys', 'journey-1', 'triage', 'evidence'], {
    target: 'target',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    leaseId: 'lease-1',
    ownerToken: 'owner-token',
    receiptId: 'receipt-1',
    artifactKind: 'report',
    offset: 2,
    limit: 9,
  })

  expect(mocks.evidence).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    leaseId: 'lease-1',
    ownerToken: 'owner-token',
    receiptId: 'receipt-1',
    artifactKind: 'report',
    offset: 2,
    limit: 9,
  })
  expect(response?.status).toBe(200)
})

it.each(['journeyId', 'targetProjectId', 'actor', 'storedPath'])(
  'rejects caller-supplied triage evidence %s before target resolution',
  async field => {
    await expect(
      postQualityJourneyTriageRoute(['quality', 'journeys', 'journey-1', 'triage', 'evidence'], {
        target: 'target',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        leaseId: 'lease-1',
        ownerToken: 'owner-token',
        receiptId: 'receipt-1',
        artifactKind: 'report',
        [field]: 'forged',
      }),
    ).rejects.toThrow('resolved by Appraise')
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.evidence).not.toHaveBeenCalled()
  },
)

it('accepts only a fully bounded triager submission', async () => {
  const response = await postQualityJourneyTriageRoute([...path.slice(0, 4), 'submit'], {
    target: 'target',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    leaseId: 'lease-1',
    ownerToken: 'owner',
    idempotencyKey: 'submit-1',
    report: {
      schemaVersion: 'appraise.quality-journey/v1',
      reportRevisionId: 'report-1',
      executionCycleId: 'execution-1',
      cycleId: 'cycle-1',
      inputHash: digest,
      summary: 'Summary.',
      findings: [],
      coverage: [
        {
          requirementId: 'requirement-1',
          scenarioRevisionIds: [],
          testRunIds: [],
          outcome: 'PASSED',
          rationale: 'Covered.',
        },
      ],
      residualRisks: ['Residual risk.'],
      recommendations: ['Recommendation.'],
    },
    result: {
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: 'assignment-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      roleContractDigest: digest,
      inputHash: digest,
      role: 'TRIAGER',
      status: 'COMPLETED',
      outputs: [
        { kind: 'TEST_REPORT_ANALYSIS_REVISION', artifactId: 'report-1', revisionId: 'report-1', contentHash: digest },
      ],
      evidenceReceipts: [],
      assumptions: [],
      blockers: [],
      unresolvedQuestions: [],
      submittedAt: '2026-09-05T00:00:00.000Z',
    },
  })
  expect(mocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({ journeyId: 'journey-1', targetProjectId: 'target-1' }),
  )
  expect(response?.status).toBe(201)
})
