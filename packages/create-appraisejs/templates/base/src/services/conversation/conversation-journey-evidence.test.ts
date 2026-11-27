import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashRuntimeCapsuleValue } from '@/lib/runtime-capsule'

import { readConversationJourneyEvidence } from './conversation-journey-evidence'

const linkedJourney = vi.hoisted(() => vi.fn())
vi.mock('./conversation-service', () => ({ getLatestConversationJourney: linkedJourney }))

const scope = {
  targetProjectId: 'project-checkout',
  conversationId: 'b77c28da-87aa-42fa-a6cb-62605f6e915c',
  journeyId: 'journey-checkout',
}

function fixture(
  options: {
    status?: 'COMPLETED' | 'CANCELLED' | 'RUNNING'
    result?: 'FAILED' | 'PASSED' | 'BLOCKED' | 'PENDING'
    stepStatus?: 'FAILED' | 'PASSED' | 'SKIPPED'
    receiptMutation?: (receipt: Record<string, unknown>) => void
    report?: boolean
    screenshot?: boolean
    wrongScenario?: boolean
  } = {},
) {
  const status = options.status ?? 'COMPLETED'
  const result = options.result ?? 'FAILED'
  const stepStatus = options.stepStatus ?? 'FAILED'
  const evidence = {
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    executionCycleId: 'execution-1',
    cycleId: 'cycle-1',
    preparedCapsuleId: 'capsule-1',
    preparedCapsulesHash: 'sha256:prepared',
    testRunId: 'test-run-1',
    runId: 'run-1',
    status,
    result,
    evidenceHealth: 'valid',
    artifacts: [
      { kind: 'report', contentHash: 'sha256:report', size: 16 },
      ...(options.screenshot === false
        ? []
        : [{ kind: 'screenshot', reportStepId: 'step-1', contentHash: 'sha256:screenshot', size: 16 }]),
    ],
    missingArtifacts: [],
  }
  const receipt: Record<string, unknown> = {
    id: 'receipt-1',
    executionCycleId: 'execution-1',
    testRunId: 'test-run-1',
    receiptHash: hashRuntimeCapsuleValue(evidence),
    evidenceJson: JSON.stringify(evidence),
  }
  options.receiptMutation?.(receipt)
  const binding = {
    executionCycleId: 'execution-1',
    preparedCapsuleId: 'capsule-1',
    testRunId: 'test-run-1',
    runId: 'run-1',
    executionCycle: { cycleId: 'cycle-1', preparedCapsulesHash: 'sha256:prepared' },
    testRun: {
      status,
      result,
      evidenceHealth: 'valid',
      targetProjectId: scope.targetProjectId,
      intent: 'QUALITY_JOURNEY',
      runId: 'run-1',
      testCases: [{ id: 'run-case-1', testCaseId: 'case-1' }],
      qualityJourneyExecutionEvidence: receipt,
    },
  }
  const report = {
    id: 'report-1',
    testRunId: 'test-run-1',
    testCases: [
      {
        reportScenarioId: options.wrongScenario ? 'other-scenario' : 'scenario-1',
        testRunTestCaseId: 'run-case-1',
        testCaseId: 'case-1',
      },
    ],
  }
  const step = {
    id: 'step-1',
    keyword: 'THEN',
    name: 'the confirmation shows an order number',
    status: stepStatus,
    errorMessage: stepStatus === 'FAILED' ? 'Expected order number, found none' : null,
    screenshotPath: options.screenshot === false ? null : '/private/screenshot.png',
    order: 2,
    reportScenario: { id: 'scenario-1', name: 'Complete checkout', reportFeature: { reportId: report.id } },
  }
  const client = {
    qualityJourney: { findFirst: vi.fn().mockResolvedValue({ executionCycles: [{ id: 'execution-1' }] }) },
    qualityJourneyExecutionTestRun: { findMany: vi.fn().mockResolvedValue([binding]) },
    report: { findMany: vi.fn().mockResolvedValue(options.report === false ? [] : [report]) },
    reportStep: { findMany: vi.fn().mockResolvedValue(options.report === false ? [] : [step]) },
  } as unknown as PrismaClient
  return { client, binding, receipt }
}

beforeEach(() => linkedJourney.mockReset().mockResolvedValue(scope.journeyId))

describe('saved Journey evidence projection', () => {
  it('shows a sealed failed checkout step with exact report and screenshot links', async () => {
    const { client } = fixture()
    const result = await readConversationJourneyEvidence(scope, client)
    expect(result.latestCycleId).toBe('execution-1')
    expect(client.qualityJourneyExecutionTestRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { executionCycleId: 'execution-1' } }),
    )
    expect(result.runs).toMatchObject([
      {
        outcome: 'FAILED',
        reason: null,
        title: 'Complete checkout',
        evidenceReceiptId: 'receipt-1',
        testRunId: 'test-run-1',
        reportId: 'report-1',
        steps: [
          {
            id: 'step-1',
            label: 'THEN the confirmation shows an order number',
            status: 'FAILED',
            errorMessage: 'Expected order number, found none',
            reportHref: '/reports/report-1?project=project-checkout&step=step-1#step-evidence',
            screenshotHref: '/api/reports/steps/step-1/screenshot?targetProjectId=project-checkout',
          },
        ],
      },
    ])
  })

  it('distinguishes observed skipped work from a passed or failed assertion', async () => {
    const { client } = fixture({ result: 'BLOCKED', stepStatus: 'SKIPPED', screenshot: false })
    const result = await readConversationJourneyEvidence(scope, client)
    expect(result.runs[0]).toMatchObject({ outcome: 'SKIPPED', reason: null })
    expect(result.runs[0]?.steps[0]).not.toHaveProperty('screenshotHref')
  })

  it.each([
    ['missing report', { report: false }, 'REPORT_MISSING'],
    ['unfinished run', { status: 'RUNNING' as const, result: 'PENDING' as const }, 'RUN_IN_PROGRESS'],
    ['cancelled run', { status: 'CANCELLED' as const, result: 'BLOCKED' as const }, 'RUN_CANCELLED'],
    [
      'tampered receipt',
      {
        receiptMutation: (receipt: Record<string, unknown>) => {
          receipt.receiptHash = 'sha256:wrong'
        },
      },
      'EVIDENCE_INVALID',
    ],
    [
      'wrong receipt run',
      {
        receiptMutation: (receipt: Record<string, unknown>) => {
          receipt.testRunId = 'other-run'
        },
      },
      'EVIDENCE_INVALID',
    ],
    ['wrong report scenario', { wrongScenario: true }, 'REPORT_INCOMPLETE'],
    [
      'malformed sealed artifacts',
      {
        receiptMutation: (receipt: Record<string, unknown>) => {
          const malformed = { ...JSON.parse(receipt.evidenceJson as string), artifacts: [null] }
          receipt.evidenceJson = JSON.stringify(malformed)
          receipt.receiptHash = hashRuntimeCapsuleValue(malformed)
        },
      },
      'EVIDENCE_INVALID',
    ],
  ])('keeps %s unverified without throwing', async (_name, options, reason) => {
    const { client } = fixture(options)
    const result = await readConversationJourneyEvidence(scope, client)
    expect(result.runs[0]).toMatchObject({ outcome: 'UNVERIFIED', reason })
  })

  it('refuses a different saved chat or target project before reading evidence', async () => {
    const { client } = fixture()
    linkedJourney.mockResolvedValueOnce('other-journey')
    await expect(readConversationJourneyEvidence(scope, client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(client.qualityJourneyExecutionTestRun.findMany).not.toHaveBeenCalled()

    linkedJourney.mockResolvedValueOnce(scope.journeyId)
    client.qualityJourney.findFirst = vi.fn().mockResolvedValue(null)
    await expect(readConversationJourneyEvidence(scope, client)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(client.qualityJourneyExecutionTestRun.findMany).not.toHaveBeenCalled()
  })
})
