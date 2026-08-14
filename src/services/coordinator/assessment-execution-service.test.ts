import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const { database } = vi.hoisted(() => ({
  database: {
    assessment: { findUniqueOrThrow: vi.fn() },
    validationVersion: { findMany: vi.fn() },
    evaluationSubjectRevision: { upsert: vi.fn() },
  },
}))

vi.mock('@/config/db-config', () => ({ default: database }))

import {
  runQualityAssessment,
  reconcileQualityAssessment,
  setAssessmentExecutionClientForTests,
  setAssessmentRuntimeServiceFactoryForTests,
  stopQualityAssessment,
} from './assessment-execution-service'

describe('assessment execution guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAssessmentExecutionClientForTests()
    setAssessmentRuntimeServiceFactoryForTests()
  })

  it('rejects an assessment with stale requirement alignment before runtime preparation', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({ status: 'READY', alignment: 'STALE' })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: { environmentId: 'env-1' },
      }),
    ).rejects.toThrow('current requirement alignment')
  })

  it('rejects standalone execution without an immutable subject before runtime preparation', async () => {
    await expect(
      runQualityAssessment({
        validationVersionIds: ['validation-1'],
        idempotencyKey: 'run-1',
        runtime: { environmentId: 'env-1' },
      }),
    ).rejects.toThrow('immutable digest subject')
  })

  it('rejects partial explicit matrix coverage before creating an AssessmentRun', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({
      id: 'assessment-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      qualityPlanRevision: {
        validationVersions: [
          {
            id: 'validation-1',
            status: 'PUBLISHED',
            publication: {
              phase: 'review_ready',
              runtimeInputJson: JSON.stringify({
                matrix: [
                  { browser: 'chromium', environment: 'env-1' },
                  { browser: 'firefox', environment: 'env-1' },
                ],
              }),
            },
          },
        ],
      },
    })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: {
          cells: [
            {
              validationVersionId: 'validation-1',
              resultMatrixCell: 'CHROMIUM:env-1',
              environmentId: 'env-1',
              browserEngine: 'CHROMIUM',
            },
          ],
        },
      }),
    ).rejects.toThrow('complete published validation matrix')
  })

  it('rejects a forged matrix label that differs from the executed browser', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({
      id: 'assessment-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      qualityPlanRevision: {
        validationVersions: [
          {
            id: 'validation-1',
            status: 'PUBLISHED',
            publication: {
              phase: 'review_ready',
              runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'env-1' }] }),
            },
          },
        ],
      },
    })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: {
          cells: [
            {
              validationVersionId: 'validation-1',
              resultMatrixCell: 'CHROMIUM:env-1',
              environmentId: 'env-1',
              browserEngine: 'FIREFOX',
            },
          ],
        },
      }),
    ).rejects.toThrow('matrix identity')
  })

  it('does not invoke cancellation when an assessment has no active runs', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    setAssessmentExecutionClientForTests({ assessmentRun: { findMany } } as never)
    const cancel = vi.fn()
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await expect(stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'operator stop' })).resolves.toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  it('terminalizes a stop that races before the first binding is prepared', async () => {
    const runUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        version: 1,
        status: 'PREPARED',
        assessmentId: 'assessment-1',
        bindings: [],
      })
      .mockResolvedValueOnce({ id: 'run-1', status: 'STOPPED', bindings: [] })
    setAssessmentExecutionClientForTests({
      assessmentRun: {
        findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        findUniqueOrThrow,
        updateMany: runUpdate,
      },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    const cancel = vi.fn()
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'race stop' })
    expect(cancel).not.toHaveBeenCalled()
    expect(runUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'run-1', status: 'STOP_REQUESTED' }, data: { status: 'STOPPED' } }),
    )
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }))
  })

  it('stops active runs without sealing cancelled evidence and cancels the assessment', async () => {
    const cancelledBinding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      runtimeInputHash: 'sha256:runtime',
      evidenceReceiptId: null,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        status: 'CANCELLED',
        result: 'CANCELLED',
        evidenceHealth: 'pending',
        completedAt: new Date(),
        reportPath: null,
        logPath: null,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready' },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({ id: 'run-1', version: 0, bindings: [{ testRunId: 'test-run-1' }] })
      .mockResolvedValueOnce({ id: 'run-1', assessmentId: 'assessment-1', bindings: [cancelledBinding] })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: 'operator stop',
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const evidenceUpsert = vi.fn()
    setAssessmentExecutionClientForTests({
      assessmentRun: {
        findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        findUniqueOrThrow,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    const cancel = vi.fn().mockResolvedValue(undefined)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'operator stop' })
    expect(cancel).toHaveBeenCalledWith('test-run-1')
    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }))
  })

  it('seals byte-bound failed evidence with derived assurance and advances review', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-run.log')
    const tracePath = path.join(process.cwd(), '.tmp-assessment-trace.zip')
    await Promise.all([
      fs.writeFile(reportPath, '{"passed":false}'),
      fs.writeFile(logPath, 'failed'),
      fs.writeFile(tracePath, 'trace'),
    ])
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      runtimeInputHash: 'sha256:runtime',
      evidenceReceiptId: null,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'HIGH' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{"data":"fixture"}' },
      },
      testRun: {
        status: 'COMPLETED',
        result: 'FAILED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready', capsuleHash: 'sha256:capsule', manifestHash: 'sha256:manifest' },
        testCases: [{ tracePath }],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: 'receipt-1', terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn().mockResolvedValue({ id: 'receipt-1' })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            outcome: 'FAILED',
            assuranceLevel: 'HIGH',
            reportHash: expect.stringMatching(/^sha256:/),
            logHash: expect.stringMatching(/^sha256:/),
            traceHash: expect.stringMatching(/^sha256:/),
          }),
        }),
      )
      expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EVIDENCE_REVIEW' } }))
    } finally {
      await Promise.all([
        fs.rm(reportPath, { force: true }),
        fs.rm(logPath, { force: true }),
        fs.rm(tracePath, { force: true }),
      ])
    }
  })

  it('seals integrity-valid human-verification evidence but returns the assessment to READY', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-blocked-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-blocked-run.log')
    await Promise.all([
      fs.writeFile(reportPath, '{"passed":false}'),
      fs.writeFile(
        logPath,
        '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
      ),
    ])
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      runtimeInputHash: 'sha256:runtime',
      evidenceReceiptId: null,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{"data":"fixture"}' },
      },
      testRun: {
        status: 'COMPLETED',
        result: 'BLOCKED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        logs: {
          logs: '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
        },
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready', capsuleHash: 'sha256:capsule', manifestHash: 'sha256:manifest' },
        testCases: [],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: 'receipt-1', terminalOutcome: 'BLOCKED', terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn().mockResolvedValue({ id: 'receipt-1' })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ outcome: 'BLOCKED' }) }),
      )
      expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'READY' } }))
      expect(assessmentUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EVIDENCE_REVIEW' } }),
      )
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it('does not seal a blocked receipt when report evidence is invalid or missing', async () => {
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      testRun: {
        status: 'COMPLETED',
        result: 'BLOCKED',
        evidenceHealth: 'invalid_missing_report',
        completedAt: new Date(),
        runtimeCapsule: { integrityState: 'ready' },
        logs: {
          logs: '{"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
        },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ terminalOutcome: 'BLOCKED', terminalizedAt: new Date(), evidenceReceiptId: null }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: bindingUpdate },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: vi.fn() },
    } as never)

    await reconcileQualityAssessment({ assessmentId: 'assessment-1' })

    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(bindingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'BLOCKED' }) }),
    )
  })

  it('terminalizes failed execution without evidence and returns the assessment to READY', async () => {
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      runtimeInputHash: 'sha256:runtime',
      evidenceReceiptId: null,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        status: 'COMPLETED',
        result: 'FAILED',
        evidenceHealth: 'infrastructure_failure',
        completedAt: new Date(),
        reportPath: null,
        logPath: null,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready' },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'READY' } }))
  })
})
