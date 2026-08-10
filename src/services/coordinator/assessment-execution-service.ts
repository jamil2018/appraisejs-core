// fallow-ignore-file code-duplication
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'

import { BrowserEngine, TestRunEvidenceHealth, TestRunResult, TestRunStatus } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashEvidenceReceipt } from '@/lib/quality-design/state'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import { ServiceError } from '@/services/shared/errors'

type AssessmentExecutionClient = typeof prisma
let executionClient: AssessmentExecutionClient = prisma

/** Replaces the transaction-capable client only for focused orchestration tests. */
export function setAssessmentExecutionClientForTests(client?: AssessmentExecutionClient) {
  executionClient = client ?? prisma
}

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
type RuntimeService = Pick<RuntimeCapsuleTestRunService, 'prepareQuality' | 'startQuality' | 'cancel'>
let runtimeServiceFactory: () => RuntimeService = () => new RuntimeCapsuleTestRunService()

/** Deterministic orchestration seam; production retains the canonical service. */
export function setAssessmentRuntimeServiceFactoryForTests(factory?: () => RuntimeService) {
  runtimeServiceFactory = factory ?? (() => new RuntimeCapsuleTestRunService())
}
const bytesHash = async (filePath: string | null | undefined) => {
  if (!filePath) return null
  try {
    return `sha256:${createHash('sha256')
      .update(await fs.readFile(filePath))
      .digest('hex')}`
  } catch {
    return null
  }
}

type RequestedCell = {
  validationVersionId: string
  resultMatrixCell: string
  environmentId: string
  browserEngine?: BrowserEngine
}

type AssessmentRunInput = {
  assessmentId?: string
  validationVersionIds?: string[]
  subject?: {
    subjectDigest: string
    subjectKind?: 'ARTIFACT' | 'DEPLOYMENT_SNAPSHOT'
    authority: string
    metadata?: unknown
  }
  runtime?: { cells?: RequestedCell[]; environmentId?: string; browserEngine?: BrowserEngine }
  idempotencyKey: string
}

// fallow-ignore-next-line complexity
async function executionIdentity(input: AssessmentRunInput) {
  if (input.assessmentId) {
    const assessment = await executionClient.assessment.findUniqueOrThrow({
      where: { id: input.assessmentId },
      include: { qualityPlanRevision: { include: { validationVersions: { include: { publication: true } } } } },
    })
    if (assessment.alignment !== 'CURRENT')
      throw new ServiceError('Assessment execution requires current requirement alignment.', 'CONFLICT')
    return {
      assessmentId: assessment.id,
      targetProjectId: assessment.targetProjectId,
      qualityPlanRevisionId: assessment.qualityPlanRevisionId,
      evaluationSubjectRevisionId: assessment.evaluationSubjectRevisionId,
      assessmentStatus: assessment.status,
      versions: assessment.qualityPlanRevision.validationVersions,
    }
  }
  if (!input.subject?.subjectDigest?.startsWith('sha256:') || !input.subject.authority)
    throw new ServiceError(
      'Standalone assessment execution requires an immutable digest subject and authority.',
      'VALIDATION',
    )
  if (!input.validationVersionIds?.length)
    throw new ServiceError(
      'Standalone assessment execution requires selected published validation versions.',
      'VALIDATION',
    )
  const versions = await executionClient.validationVersion.findMany({
    where: { id: { in: input.validationVersionIds } },
    include: { publication: true, qualityPlanRevision: true },
  })
  if (versions.length !== new Set(input.validationVersionIds).size)
    throw new ServiceError('Standalone assessment execution references an unknown validation version.', 'NOT_FOUND')
  const revision = versions[0]!.qualityPlanRevision
  if (versions.some(version => version.qualityPlanRevisionId !== revision.id))
    throw new ServiceError('Standalone validations must belong to one Quality Plan revision.', 'CONFLICT')
  const subject = await executionClient.evaluationSubjectRevision.upsert({
    where: { subjectDigest: input.subject.subjectDigest },
    create: {
      subjectDigest: input.subject.subjectDigest,
      subjectKind: input.subject.subjectKind ?? 'ARTIFACT',
      authority: input.subject.authority,
      metadataJson: input.subject.metadata === undefined ? null : canonicalContractJson(input.subject.metadata),
    },
    update: {},
  })
  return {
    assessmentId: null,
    targetProjectId: revision.targetProjectId,
    qualityPlanRevisionId: revision.id,
    evaluationSubjectRevisionId: subject.id,
    assessmentStatus: null,
    versions,
  }
}

// fallow-ignore-next-line complexity
function validateCells(
  cells: RequestedCell[],
  identity: Awaited<ReturnType<typeof executionIdentity>>,
  selectedIds?: string[],
) {
  if (!cells.length)
    throw new ServiceError('Assessment execution requires at least one validation matrix cell.', 'VALIDATION')
  const unique = new Set(cells.map(cell => `${cell.validationVersionId}:${cell.resultMatrixCell}`))
  if (unique.size !== cells.length)
    throw new ServiceError('Assessment execution repeats a validation matrix cell.', 'VALIDATION')
  const published = new Map(
    identity.versions
      .filter(version => version.status === 'PUBLISHED' && version.publication?.phase === 'review_ready')
      .map(version => [version.id, version]),
  )
  if (published.size !== identity.versions.length)
    throw new ServiceError(
      'Assessment execution requires every validation version to be published and executable.',
      'CONFLICT',
    )
  const selected = new Set(selectedIds?.length ? selectedIds : published.keys())
  for (const versionId of selected)
    if (!published.has(versionId))
      throw new ServiceError('Assessment execution references an unpublished validation version.', 'CONFLICT')
  for (const cell of cells)
    if (!selected.has(cell.validationVersionId))
      throw new ServiceError('Assessment execution references an unpublished validation version.', 'CONFLICT')
  for (const cell of cells) {
    const browser = cell.browserEngine ?? BrowserEngine.CHROMIUM
    if (cell.resultMatrixCell !== `${browser}:${cell.environmentId}`)
      throw new ServiceError('Assessment matrix identity does not match its browser and environment.', 'VALIDATION')
  }
  return new Map([...published].filter(([id]) => selected.has(id)))
}

function requiredMatrixCells(versions: Iterable<{ id: string; publication: { runtimeInputJson: string } | null }>) {
  const required = new Set<string>()
  for (const version of versions) {
    const matrix = JSON.parse(version.publication!.runtimeInputJson) as {
      matrix?: Array<{ browser: string; environment: string }>
    }
    if (!matrix.matrix?.length)
      throw new ServiceError('Published validation has no immutable runtime matrix.', 'CONFLICT')
    for (const cell of matrix.matrix) required.add(`${version.id}:${cell.browser.toUpperCase()}:${cell.environment}`)
  }
  return required
}

function derivedCells(
  input: AssessmentRunInput,
  identity: Awaited<ReturnType<typeof executionIdentity>>,
): RequestedCell[] {
  if (input.runtime?.cells?.length) return input.runtime.cells
  if (!input.runtime?.environmentId)
    throw new ServiceError('Assessment runtime requires environmentId or explicit matrix cells.', 'VALIDATION')
  const environmentId = input.runtime.environmentId
  const browserEngine = input.runtime.browserEngine ?? BrowserEngine.CHROMIUM
  const versionIds = input.validationVersionIds?.length
    ? input.validationVersionIds
    : identity.versions.map(version => version.id)
  return versionIds.map(validationVersionId => ({
    validationVersionId,
    resultMatrixCell: `${browserEngine}:${environmentId}`,
    environmentId,
    browserEngine,
  }))
}

/** Starts real capsule executions. The durable AssessmentRun is created before
 * materialization, while each cell binds the immutable TestRun and publication
 * receipt only after canonical preparation succeeds. */
// fallow-ignore-next-line complexity
export async function runQualityAssessment(input: AssessmentRunInput) {
  const identity = await executionIdentity(input)
  const cells = derivedCells(input, identity)
  const publications = validateCells(cells, identity, input.validationVersionIds)
  const supplied = new Set(cells.map(cell => `${cell.validationVersionId}:${cell.resultMatrixCell}`))
  const required = requiredMatrixCells(publications.values())
  if (required.size !== supplied.size || [...required].some(cell => !supplied.has(cell)))
    throw new ServiceError('Assessment execution must cover the complete published validation matrix.', 'VALIDATION')
  const requestHash = hash({
    assessmentId: identity.assessmentId,
    targetProjectId: identity.targetProjectId,
    qualityPlanRevisionId: identity.qualityPlanRevisionId,
    evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
    cells: [...cells].sort((a, b) =>
      `${a.validationVersionId}:${a.resultMatrixCell}`.localeCompare(`${b.validationVersionId}:${b.resultMatrixCell}`),
    ),
  })
  const idempotencyScope =
    identity.assessmentId ??
    `standalone:${identity.targetProjectId}:${identity.qualityPlanRevisionId}:${identity.evaluationSubjectRevisionId}`
  const run = await executionClient.$transaction(async tx => {
    const existing = await tx.assessmentRun.findUnique({
      where: { idempotencyScope_idempotencyKey: { idempotencyScope, idempotencyKey: input.idempotencyKey } },
      include: { bindings: true },
    })
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ServiceError('Assessment execution idempotency key has different request content.', 'CONFLICT')
      return existing
    }
    if (identity.assessmentId && identity.assessmentStatus !== 'READY')
      throw new ServiceError('New Assessment execution requires a READY assessment.', 'CONFLICT')
    return tx.assessmentRun.create({
      data: {
        assessmentId: identity.assessmentId,
        targetProjectId: identity.targetProjectId,
        qualityPlanRevisionId: identity.qualityPlanRevisionId,
        evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
        idempotencyScope,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
      include: { bindings: true },
    })
  })
  // Replay must repair a partially prepared run rather than only returning its
  // current receipt state; completed bindings are left immutable.
  const durableBindings = await executionClient.assessmentRunBinding.findMany({
    where: { assessmentRunId: run.id },
    include: { testRun: true },
  })
  const existingBindings = new Map(
    durableBindings.map(binding => [`${binding.validationVersionId}:${binding.resultMatrixCell}`, binding]),
  )
  const runtime = runtimeServiceFactory()
  for (const cell of cells) {
    const currentRun = await executionClient.assessmentRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    })
    if (currentRun.status === 'STOP_REQUESTED' || currentRun.status === 'STOPPED') break
    const version = publications.get(cell.validationVersionId)!
    const publication = version.publication!
    const existing = existingBindings.get(`${version.id}:${cell.resultMatrixCell}`)
    if (existing) {
      if (existing.runtimeInputHash !== publication.runtimeInputHash)
        throw new ServiceError(
          'Concurrent AssessmentRun binding has different immutable execution content.',
          'CONFLICT',
        )
      if (existing.testRun.status === TestRunStatus.QUEUED)
        await runtime.startQuality({
          publicationId: publication.id,
          validationVersionId: version.id,
          targetProjectId: identity.targetProjectId,
          environmentId: cell.environmentId,
          name: existing.testRun.name,
          browserEngine: existing.testRun.browserEngine,
          testRunDbId: existing.testRunId,
        })
      continue
    }
    const prepared = await runtime.prepareQuality({
      publicationId: publication.id,
      validationVersionId: version.id,
      targetProjectId: identity.targetProjectId,
      environmentId: cell.environmentId,
      name: `assessment:${run.id}:${cell.resultMatrixCell}`,
      browserEngine: cell.browserEngine ?? BrowserEngine.CHROMIUM,
      preparationKey: hash({ assessmentRunId: run.id, validationVersionId: version.id, cell: cell.resultMatrixCell }),
    })
    const binding = await executionClient.assessmentRunBinding.upsert({
      where: {
        assessmentRunId_validationVersionId_resultMatrixCell: {
          assessmentRunId: run.id,
          validationVersionId: version.id,
          resultMatrixCell: cell.resultMatrixCell,
        },
      },
      create: {
        assessmentRunId: run.id,
        validationVersionId: version.id,
        resultMatrixCell: cell.resultMatrixCell,
        testRunId: prepared.id,
        runtimeInputHash: publication.runtimeInputHash,
      },
      update: {},
    })
    if (binding.testRunId !== prepared.id || binding.runtimeInputHash !== publication.runtimeInputHash)
      throw new ServiceError('Concurrent AssessmentRun binding has different immutable execution content.', 'CONFLICT')
    const beforeStart = await executionClient.assessmentRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    })
    if (beforeStart.status === 'STOP_REQUESTED' || beforeStart.status === 'STOPPED') {
      await runtime.cancel(prepared.id)
      break
    }
    await runtime.startQuality({
      publicationId: publication.id,
      validationVersionId: version.id,
      targetProjectId: identity.targetProjectId,
      environmentId: cell.environmentId,
      name: prepared.name,
      browserEngine: prepared.browserEngine,
      testRunDbId: prepared.id,
    })
  }
  const started = await executionClient.assessmentRun.updateMany({
    where: { id: run.id, status: 'PREPARED' },
    data: { status: 'RUNNING', version: { increment: 1 } },
  })
  if (identity.assessmentId && started.count)
    await executionClient.assessment.updateMany({
      where: { id: identity.assessmentId, status: 'READY' },
      data: { status: 'RUNNING' },
    })
  return reconcileQualityAssessmentRun({ assessmentRunId: run.id })
}

async function stopQualityAssessmentRun(input: { assessmentRunId: string; reason?: string }) {
  const run = await executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: input.assessmentRunId },
    include: { bindings: true },
  })
  const marked = await executionClient.assessmentRun.updateMany({
    where: { id: run.id, version: run.version, status: { in: ['PREPARED', 'RUNNING', 'STOP_REQUESTED'] } },
    data: { status: 'STOP_REQUESTED', stopReason: input.reason ?? null, version: { increment: 1 } },
  })
  if (!marked.count) return reconcileQualityAssessmentRun({ assessmentRunId: run.id })
  const runtime = runtimeServiceFactory()
  await Promise.all(run.bindings.map(binding => runtime.cancel(binding.testRunId)))
  if (!run.bindings.length) {
    await executionClient.assessmentRun.updateMany({
      where: { id: run.id, status: 'STOP_REQUESTED' },
      data: { status: 'STOPPED' },
    })
    if (run.assessmentId)
      await executionClient.assessment.updateMany({
        where: { id: run.assessmentId, status: { in: ['RUNNING', 'READY'] } },
        data: { status: 'CANCELLED' },
      })
    return executionClient.assessmentRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { bindings: { include: { evidenceReceipt: true, testRun: true } } },
    })
  }
  return reconcileQualityAssessmentRun({ assessmentRunId: run.id })
}

export async function stopQualityAssessment(input: { assessmentId: string; reason?: string }) {
  const runs = await executionClient.assessmentRun.findMany({
    where: { assessmentId: input.assessmentId, status: { in: ['PREPARED', 'RUNNING', 'STOP_REQUESTED'] } },
    select: { id: true },
  })
  return Promise.all(runs.map(run => stopQualityAssessmentRun({ assessmentRunId: run.id, reason: input.reason })))
}

function outcomeFor(run: { status: TestRunStatus; result: TestRunResult }) {
  if (run.result === TestRunResult.PASSED) return 'PASSED' as const
  if (run.status === TestRunStatus.CANCELLED || run.result === TestRunResult.CANCELLED) return 'BLOCKED' as const
  if (run.result === TestRunResult.FAILED) return 'FAILED' as const
  return 'INCONCLUSIVE' as const
}

function terminal(run: { status: TestRunStatus }) {
  return run.status === TestRunStatus.COMPLETED || run.status === TestRunStatus.CANCELLED
}

function evidenceEligible(run: {
  status: TestRunStatus
  result: TestRunResult
  evidenceHealth: TestRunEvidenceHealth
  runtimeCapsule: { integrityState: string } | null
}) {
  return (
    run.status === TestRunStatus.COMPLETED &&
    (run.result === TestRunResult.PASSED || run.result === TestRunResult.FAILED) &&
    run.evidenceHealth === TestRunEvidenceHealth.valid &&
    run.runtimeCapsule?.integrityState === 'ready'
  )
}

function assuranceFor(validationVersion: { canonicalAstJson: string }) {
  const value = JSON.parse(validationVersion.canonicalAstJson) as { requiredMinimumAssurance?: string }
  if (
    value.requiredMinimumAssurance === 'SMOKE' ||
    value.requiredMinimumAssurance === 'HIGH' ||
    value.requiredMinimumAssurance === 'EXHAUSTIVE'
  )
    return value.requiredMinimumAssurance
  if (value.requiredMinimumAssurance === 'STANDARD') return value.requiredMinimumAssurance
  throw new ServiceError('Validation version lacks a derived required assurance level.', 'CONFLICT')
}

/** Reconciliation treats TestRun terminal state as authoritative. Receipt
 * hashes are calculated from artifact bytes (never their paths), then an
 * optimistic binding update preserves the first terminal outcome in races. */
// fallow-ignore-next-line complexity
async function reconcileQualityAssessmentRun(input: { assessmentRunId: string }) {
  const run = await executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: input.assessmentRunId },
    include: {
      bindings: {
        include: {
          validationVersion: { include: { publication: true } },
          testRun: { include: { environment: true, runtimeCapsule: true, testCases: { select: { tracePath: true } } } },
        },
      },
      assessment: true,
      evaluationSubjectRevision: true,
    },
  })
  for (const binding of run.bindings) {
    if (binding.evidenceReceiptId || !terminal(binding.testRun)) continue
    if (!evidenceEligible(binding.testRun)) {
      await executionClient.assessmentRunBinding.updateMany({
        where: { id: binding.id, version: binding.version, evidenceReceiptId: null },
        data: {
          terminalOutcome: outcomeFor(binding.testRun),
          terminalizedAt: binding.testRun.completedAt ?? new Date(),
          version: { increment: 1 },
        },
      })
      continue
    }
    const traceHashes = await Promise.all(binding.testRun.testCases.map(testCase => bytesHash(testCase.tracePath)))
    const [reportHash, logHash] = await Promise.all([
      bytesHash(binding.testRun.reportPath),
      bytesHash(binding.testRun.logPath),
    ])
    if (!reportHash || !logHash) {
      await executionClient.assessmentRunBinding.updateMany({
        where: { id: binding.id, version: binding.version, evidenceReceiptId: null },
        data: {
          terminalOutcome: 'INCONCLUSIVE',
          terminalizedAt: binding.testRun.completedAt ?? new Date(),
          version: { increment: 1 },
        },
      })
      continue
    }
    const traceHash = traceHashes.length && traceHashes.every(Boolean) ? hash(traceHashes) : null
    const capsule = binding.testRun.runtimeCapsule
    const outcome = outcomeFor(binding.testRun)
    const environmentSnapshotHash = hash({
      id: binding.testRun.environment.id,
      baseUrl: binding.testRun.environment.baseUrl,
    })
    const browserSnapshotHash = hash({ browser: binding.testRun.browserEngine })
    const dataProvenanceHash = hash({
      subjectRevisionId: run.evaluationSubjectRevisionId,
      runtimeInputHash: binding.runtimeInputHash,
      runtimeInput: binding.validationVersion.publication?.runtimeInputJson ?? null,
    })
    const outputHash = hash({
      capsuleHash: capsule?.capsuleHash ?? null,
      manifestHash: capsule?.manifestHash ?? null,
      reportHash,
      logHash,
      traceHash,
    })
    const receiptHash = hashEvidenceReceipt({
      validationVersionHash: binding.validationVersion.canonicalHash,
      resultMatrixCell: binding.resultMatrixCell,
      subjectDigest: run.evaluationSubjectRevision.subjectDigest,
      runtimeInputHash: binding.runtimeInputHash,
      environmentSnapshotHash,
      browserSnapshotHash,
      dataProvenanceHash,
      outputHash,
      outcome,
      reportHash,
      logHash,
      ...(traceHash ? { traceHash } : {}),
    })
    const receipt = await executionClient.evidenceReceipt.upsert({
      where: { receiptHash },
      create: {
        targetProjectId: run.targetProjectId,
        qualityPlanRevisionId: run.qualityPlanRevisionId,
        assessmentId: run.assessmentId,
        validationVersionId: binding.validationVersionId,
        evaluationSubjectRevisionId: run.evaluationSubjectRevisionId,
        resultMatrixCell: binding.resultMatrixCell,
        assuranceLevel: assuranceFor(binding.validationVersion),
        outcome,
        runtimeInputHash: binding.runtimeInputHash,
        environmentSnapshotHash,
        browserSnapshotHash,
        dataProvenanceHash,
        outputHash,
        reportHash,
        logHash,
        traceHash,
        receiptHash,
      },
      update: {},
    })
    await executionClient.assessmentRunBinding.updateMany({
      where: { id: binding.id, version: binding.version, evidenceReceiptId: null },
      data: {
        evidenceReceiptId: receipt.id,
        terminalOutcome: outcome,
        terminalizedAt: binding.testRun.completedAt ?? new Date(),
        version: { increment: 1 },
      },
    })
  }
  const current = await executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { bindings: true },
  })
  const allTerminal =
    current.bindings.length > 0 &&
    current.bindings.every(binding => binding.terminalizedAt || binding.evidenceReceiptId)
  const evidenceComplete = allTerminal && current.bindings.every(binding => binding.evidenceReceiptId)
  if (allTerminal) {
    const status = current.stopReason ? 'STOPPED' : 'COMPLETED'
    await executionClient.assessmentRun.updateMany({
      where: { id: current.id, status: { in: ['PREPARED', 'RUNNING', 'STOP_REQUESTED'] } },
      data: { status },
    })
    if (current.assessmentId && evidenceComplete && !current.stopReason)
      await executionClient.assessment.updateMany({
        where: { id: current.assessmentId, status: 'RUNNING' },
        data: { status: 'EVIDENCE_REVIEW' },
      })
    if (current.assessmentId && !evidenceComplete && !current.stopReason)
      await executionClient.assessment.updateMany({
        where: { id: current.assessmentId, status: 'RUNNING' },
        data: { status: 'READY' },
      })
  }
  if (current.assessmentId && current.stopReason && allTerminal)
    await executionClient.assessment.updateMany({
      where: { id: current.assessmentId, status: { in: ['RUNNING', 'READY'] } },
      data: { status: 'CANCELLED' },
    })
  return executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { bindings: { include: { evidenceReceipt: true, testRun: true } } },
  })
}

export async function reconcileQualityAssessment(input: { assessmentId: string; runIds?: string[] }) {
  const runs = await executionClient.assessmentRun.findMany({
    where: { assessmentId: input.assessmentId, ...(input.runIds?.length ? { id: { in: input.runIds } } : {}) },
    select: { id: true },
  })
  if (input.runIds?.length && runs.length !== new Set(input.runIds).size)
    throw new ServiceError('Assessment reconciliation references a run outside the assessment.', 'NOT_FOUND')
  return Promise.all(runs.map(run => reconcileQualityAssessmentRun({ assessmentRunId: run.id })))
}
