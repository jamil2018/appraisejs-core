import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'

import {
  AssuranceLevel,
  BrowserEngine,
  Prisma,
  TestRunEvidenceHealth,
  TestRunResult,
  TestRunStatus,
} from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { frozenEnvironmentSnapshot } from '@/lib/quality-design/frozen-environment-snapshot'
import { hashCanonical, hashEvidenceReceipt } from '@/lib/quality-design/state'
import { validationArtifactSchema } from '@/lib/quality-design/validation-artifact-contract'
import {
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  expectedQualityPublicationPreflightAuthority,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import { assertManagedRuntimeReady } from '@/lib/runtime-capsule/runtime-readiness'
import { hashRuntimeCapsuleValue, parseCanonicalRuntimeCapsuleManifest } from '@/lib/runtime-capsule/contracts'
import { findHumanVerificationEvent } from '@/lib/test-run/human-verification-event'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import { ServiceError } from '@/services/shared/errors'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { consentPolicy } from './quality-operating-system-service'
import {
  consumeCredentialExecutionGrant,
  credentialAuthorizationInput,
  ensureCredentialExecutionRequest,
  executionRequiresCredential,
} from './credential-execution-authorization-service'

type AssessmentExecutionClient = typeof prisma
let executionClient: AssessmentExecutionClient = prisma

/** Replaces the transaction-capable client only for focused orchestration tests. */
export function setAssessmentExecutionClientForTests(client?: AssessmentExecutionClient) {
  executionClient = client ?? prisma
}

type CredentialAuthorizationService = Pick<
  typeof import('./credential-execution-authorization-service'),
  | 'consumeCredentialExecutionGrant'
  | 'credentialAuthorizationInput'
  | 'ensureCredentialExecutionRequest'
  | 'executionRequiresCredential'
>
let credentialAuthorizationService: CredentialAuthorizationService = {
  consumeCredentialExecutionGrant,
  credentialAuthorizationInput,
  ensureCredentialExecutionRequest,
  executionRequiresCredential,
}

/** Keeps authorization checks deterministic in lifecycle tests without
 * providing production code a bypass around grant consumption. */
export function setAssessmentCredentialAuthorizationServiceForTests(service?: CredentialAuthorizationService) {
  credentialAuthorizationService = service ?? {
    consumeCredentialExecutionGrant,
    credentialAuthorizationInput,
    ensureCredentialExecutionRequest,
    executionRequiresCredential,
  }
}

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
type RuntimeService = Pick<RuntimeCapsuleTestRunService, 'prepareQuality' | 'startQuality' | 'cancel'>
let runtimeServiceFactory: () => RuntimeService = () => new RuntimeCapsuleTestRunService()

type RemoteScopeCurrentInput = {
  subjectRevisionId: string
  targetProjectId: string
  qualityPlanId: string
  revisionId: string
  environmentId: string
}
type RemoteScopeCurrentAssertion = (
  input: RemoteScopeCurrentInput,
  client?: Prisma.TransactionClient,
) => Promise<unknown>

async function assertRemoteScopeCurrent(input: RemoteScopeCurrentInput, client?: Prisma.TransactionClient) {
  const { assertRemoteEvaluationScopeCurrent } = await import('./remote-evaluation-scope-service')
  return assertRemoteEvaluationScopeCurrent(input, client as never)
}

let remoteScopeCurrentAssertion: RemoteScopeCurrentAssertion = assertRemoteScopeCurrent

/** Narrow test seam; production always uses the canonical scope guard. */
export function setRemoteScopeCurrentAssertionForTests(assertion?: RemoteScopeCurrentAssertion) {
  remoteScopeCurrentAssertion = assertion ?? assertRemoteScopeCurrent
}

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
  assessmentId: string
  validationVersionIds?: string[]
  runtime?: { cells?: RequestedCell[]; environmentId?: string; browserEngine?: BrowserEngine }
  authorizationGrantId?: string
  executionRequestId?: string
  expectedRequestHash?: string
  consentId?: string
  expectedExecutionManifestHash?: string
  riskClassification?: 'READ_ONLY' | 'REVERSIBLE_WRITE' | 'MATERIAL_EFFECT'
  materialEffects?: Array<
    | 'PERMISSION_ESCALATION'
    | 'ACCOUNT_CREATION'
    | 'PURCHASE'
    | 'DESTRUCTIVE_MUTATION'
    | 'EXTERNAL_MESSAGE'
    | 'IRREVERSIBLE_SIDE_EFFECT'
    | 'UNCLASSIFIED_OPERATION'
  >
  idempotencyKey: string
}

async function assertExecutionSubjectIsRunnable(assessment: {
  id: string
  targetProjectId: string
  status: string
  evaluationSubjectRevision: { subjectKind?: string | null } | null
}) {
  // The production include always supplies subjectKind. Keeping this guard
  // conditional preserves narrow orchestration test seams that intentionally
  // model only the legacy digest projection.
  if (!assessment.evaluationSubjectRevision?.subjectKind) return
  const target = await resolveTargetProject(assessment.targetProjectId)
  if (
    target.kind !== 'REMOTE_BLACK_BOX' ||
    assessment.evaluationSubjectRevision.subjectKind === 'REMOTE_EVALUATION_SCOPE'
  )
    return
  if (!['DECIDED', 'STALE', 'CANCELLED'].includes(assessment.status))
    await executionClient.assessment.update({ where: { id: assessment.id }, data: { status: 'STALE' } })
  throw new ServiceError(
    'Legacy remote descriptor Assessment is stale and non-runnable; create a remote evaluation scope and successor.',
    'CONFLICT',
    409,
    { code: 'legacy_remote_descriptor_stale' },
  )
}

async function executionIdentity(input: AssessmentRunInput) {
  const assessment = await executionClient.assessment.findUniqueOrThrow({
    where: { id: input.assessmentId },
    include: {
      evaluationSubjectRevision: { select: { subjectDigest: true, subjectKind: true } },
      targetProject: { select: { kind: true } },
      qualityPlanRevision: {
        include: { validationVersions: { include: { activeGeneration: { include: { publication: true } } } } },
      },
    },
  })
  if (assessment.alignment !== 'CURRENT')
    throw new ServiceError('Assessment execution requires current requirement alignment.', 'CONFLICT')
  await assertExecutionSubjectIsRunnable(assessment)
  return {
    assessmentId: assessment.id,
    targetProjectId: assessment.targetProjectId,
    // TargetProject is always selected in production. The fallback keeps
    // narrow legacy orchestration doubles from turning a domain rejection
    // into an incidental TypeError.
    targetKind:
      assessment.targetProject?.kind ??
      (assessment.evaluationSubjectRevision?.subjectKind === 'REMOTE_EVALUATION_SCOPE'
        ? 'REMOTE_BLACK_BOX'
        : 'LOCAL_WORKSPACE'),
    qualityPlanId: assessment.qualityPlanId,
    qualityPlanRevisionId: assessment.qualityPlanRevisionId,
    evaluationSubjectRevisionId: assessment.evaluationSubjectRevisionId,
    subjectDigest: assessment.evaluationSubjectRevision?.subjectDigest ?? '',
    subjectKind: assessment.evaluationSubjectRevision?.subjectKind ?? null,
    assessmentStatus: assessment.status,
    versions: assessment.qualityPlanRevision.validationVersions,
  }
}

type ExecutionIdentity = Awaited<ReturnType<typeof executionIdentity>>
type ReadyAssessmentIdentity = Pick<
  ExecutionIdentity,
  'assessmentId' | 'targetProjectId' | 'qualityPlanRevisionId' | 'evaluationSubjectRevisionId'
>
type RemoteScopeBinding = {
  targetProjectId: string
  environmentId: string
  environmentSnapshotHash: string
  environmentSnapshotJson: string
  environmentScopeVersion: number
  environmentUpdatedAt: Date
}

function snapshotIntegrityError() {
  return new ServiceError('Frozen TestRun environment snapshot does not match its sealed identity.', 'CONFLICT')
}

function sealedRemoteEnvironmentSnapshot(testRun: {
  environment: { id: string; baseUrl: string }
  environmentSnapshotHash?: string | null
  environmentSnapshotJson?: string | null
  environmentSnapshotVersion?: number | null
}) {
  try {
    frozenEnvironmentSnapshot(testRun, { required: true })
    return testRun.environmentSnapshotHash!
  } catch {
    throw snapshotIntegrityError()
  }
}

function sealedLocalEnvironmentSnapshot(testRun: {
  environment: { id: string; baseUrl: string }
  environmentSnapshotHash?: string | null
  environmentSnapshotJson?: string | null
  environmentSnapshotVersion?: number | null
}) {
  if (!testRun.environmentSnapshotJson)
    return hash({ id: testRun.environment.id, baseUrl: testRun.environment.baseUrl })
  let snapshot: Record<string, unknown>
  try {
    snapshot = JSON.parse(testRun.environmentSnapshotJson) as Record<string, unknown>
  } catch {
    throw new ServiceError('Frozen TestRun environment snapshot is not valid JSON.', 'CONFLICT')
  }
  if (
    snapshot.id !== testRun.environment.id ||
    !testRun.environmentSnapshotHash ||
    hashCanonical(snapshot) !== testRun.environmentSnapshotHash ||
    (testRun.environmentSnapshotVersion !== null &&
      testRun.environmentSnapshotVersion !== undefined &&
      snapshot.scopeVersion !== testRun.environmentSnapshotVersion)
  )
    throw snapshotIntegrityError()
  return testRun.environmentSnapshotHash
}

function sealedEnvironmentSnapshot(
  testRun: {
    environment: { id: string; baseUrl: string }
    environmentSnapshotHash?: string | null
    environmentSnapshotJson?: string | null
    environmentSnapshotVersion?: number | null
  },
  remote: boolean,
) {
  return remote ? sealedRemoteEnvironmentSnapshot(testRun) : sealedLocalEnvironmentSnapshot(testRun)
}

async function reserveCurrentReadyAssessment(tx: Prisma.TransactionClient, identity: ReadyAssessmentIdentity) {
  // Claim READY -> RUNNING in the same transaction that creates the first
  // AssessmentRun. This durable CAS prevents two fresh preparation keys from
  // opening parallel execution generations for one Assessment root.
  const reserved = await tx.assessment.updateMany({
    where: {
      id: identity.assessmentId,
      targetProjectId: identity.targetProjectId,
      qualityPlanRevisionId: identity.qualityPlanRevisionId,
      evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
      status: 'READY',
    },
    data: { status: 'RUNNING' },
  })
  if (reserved.count === 1) return
  const assessment = await tx.assessment.findUnique({
    where: { id: identity.assessmentId },
    select: {
      targetProjectId: true,
      qualityPlanRevisionId: true,
      evaluationSubjectRevisionId: true,
      status: true,
    },
  })
  if (
    !assessment ||
    assessment.targetProjectId !== identity.targetProjectId ||
    assessment.qualityPlanRevisionId !== identity.qualityPlanRevisionId ||
    assessment.evaluationSubjectRevisionId !== identity.evaluationSubjectRevisionId
  )
    throw new ServiceError('New Assessment execution requires the same READY assessment.', 'CONFLICT')
  throw new ServiceError(
    'Assessment execution is already reserved by an active run; wait for it or reconcile its terminal evidence.',
    'CONFLICT',
    409,
    { code: 'assessment_execution_reserved', assessmentId: identity.assessmentId },
  )
}

/** Narrow concurrency seam for the durable READY -> RUNNING reservation. */
export function reserveReadyAssessmentForTests(tx: Prisma.TransactionClient, identity: ReadyAssessmentIdentity) {
  return reserveCurrentReadyAssessment(tx, identity)
}

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
  const selected = new Set(selectedIds?.length ? selectedIds : identity.versions.map(version => version.id))
  const selectedVersions = identity.versions.filter(version => selected.has(version.id))
  const published = new Map(
    selectedVersions
      .filter(version => {
        const generation = version.activeGeneration
        const publication = generation?.publication
        return Boolean(
          generation &&
          publication &&
          generation.disposition === 'ACTIVE' &&
          generation.preflightAlgorithmVersion === ASSESSMENT_PREFLIGHT_ALGORITHM &&
          generation.preflightAuthority === expectedQualityPublicationPreflightAuthority(identity.targetKind) &&
          publication.generationId === generation.id &&
          publication.phase === 'review_ready' &&
          publication.preflightAlgorithmVersion === ASSESSMENT_PREFLIGHT_ALGORITHM &&
          publication.preflightDisposition === 'ACTIVE' &&
          publication.preflightAuthority === generation.preflightAuthority,
        )
      })
      .map(version => [version.id, version]),
  )
  if (published.size !== selectedVersions.length)
    throw new ServiceError(
      'Assessment execution requires every validation version to have a supported active generation and exact review-ready publication.',
      'CONFLICT',
    )
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

async function persistedPartitionValidationIds(identity: ExecutionIdentity) {
  if (identity.subjectKind !== 'REMOTE_EVALUATION_SCOPE') return undefined
  if (
    typeof (executionClient as unknown as { evaluationSubjectRevision?: { findFirst?: unknown } })
      .evaluationSubjectRevision?.findFirst !== 'function'
  )
    return undefined
  const remoteScopeModule = await import('./remote-evaluation-scope-service')
  if (!('remoteScopePartitionAuthorityForSubject' in remoteScopeModule)) return undefined
  const authority = await remoteScopeModule.remoteScopePartitionAuthorityForSubject(
    {
      subjectRevisionId: identity.evaluationSubjectRevisionId,
    },
    executionClient as never,
  )
  return authority.kind === 'persisted-partition-manifest' ? authority.validationVersionIds : undefined
}

function partitionAuthorityViolation(): never {
  throw new ServiceError('REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION', 'CONFLICT', 409, {
    code: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION',
  })
}

function partitionScopedInput(
  input: AssessmentRunInput,
  partitionValidationIds?: readonly string[],
): AssessmentRunInput {
  if (!partitionValidationIds) return input
  const allowed = new Set(partitionValidationIds)
  if (
    input.validationVersionIds?.some(id => !allowed.has(id)) ||
    input.runtime?.cells?.some(cell => !allowed.has(cell.validationVersionId))
  )
    partitionAuthorityViolation()
  return { ...input, validationVersionIds: [...partitionValidationIds] }
}

function requiredMatrixCells(
  versions: Iterable<{ id: string; activeGeneration: { publication: { runtimeInputJson: string } | null } | null }>,
) {
  const required = new Set<string>()
  for (const version of versions) {
    const matrix = JSON.parse(version.activeGeneration!.publication!.runtimeInputJson) as {
      matrix?: Array<{ browser: string; environment: string }>
    }
    if (!matrix.matrix?.length)
      throw new ServiceError('Published validation has no immutable runtime matrix.', 'CONFLICT')
    for (const cell of matrix.matrix) required.add(`${version.id}:${cell.browser.toUpperCase()}:${cell.environment}`)
  }
  return required
}

export function derivedAssessmentCells(
  input: AssessmentRunInput,
  identity: Awaited<ReturnType<typeof executionIdentity>>,
): RequestedCell[] {
  if (input.runtime?.cells?.length) return input.runtime.cells
  const versionIds = input.validationVersionIds?.length
    ? input.validationVersionIds
    : identity.versions.map(version => version.id)
  if (!input.runtime?.environmentId) {
    return identity.versions
      .filter(version => versionIds.includes(version.id))
      .flatMap(version => {
        if (!version.activeGeneration?.publication)
          throw new ServiceError('Assessment execution references an unpublished validation version.', 'CONFLICT')
        const runtimeInput = JSON.parse(version.activeGeneration.publication.runtimeInputJson) as {
          matrix?: Array<{ browser: string; environment: string }>
        }
        return (runtimeInput.matrix ?? []).map(cell => {
          const browserEngine = cell.browser.toUpperCase() as BrowserEngine
          if (!Object.values(BrowserEngine).includes(browserEngine))
            throw new ServiceError(`Published validation has unsupported browser "${cell.browser}".`, 'CONFLICT')
          return {
            validationVersionId: version.id,
            resultMatrixCell: `${browserEngine}:${cell.environment}`,
            environmentId: cell.environment,
            browserEngine,
          }
        })
      })
  }
  const environmentId = input.runtime.environmentId
  const browserEngine = input.runtime.browserEngine ?? BrowserEngine.CHROMIUM
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
export async function runQualityAssessment(input: AssessmentRunInput) {
  const identity = await executionIdentity(input)
  const effectiveInput = partitionScopedInput(input, await persistedPartitionValidationIds(identity))
  const priorRun = await priorAssessmentRun(assessmentIdempotencyScope(identity), effectiveInput.idempotencyKey)
  if (priorRun) {
    const replayState = assessmentRunReplayState(priorRun)
    if (replayState === 'terminal') throw terminalAssessmentExecutionError(identity)
    if (replayState === 'incomplete') throw incompleteAssessmentExecutionError(identity)
    const replay = await replayExecutionFromCheckpoints(priorRun.id)
    const requestedVersionIds = [
      ...new Set(effectiveInput.validationVersionIds ?? replay.selections.map(item => item.validationVersionId)),
    ]
    if (
      requestedVersionIds.length !== replay.selections.length ||
      requestedVersionIds.some(id => !replay.selections.some(selection => selection.validationVersionId === id))
    )
      throw new ServiceError('Assessment execution idempotency key has different request content.', 'CONFLICT')
    assertMatchingRequestHash(
      priorRun,
      assessmentExecutionRequestHash({
        assessmentId: identity.assessmentId,
        targetProjectId: identity.targetProjectId,
        qualityPlanRevisionId: identity.qualityPlanRevisionId,
        evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
        cells: effectiveInput.runtime?.cells?.length ? effectiveInput.runtime.cells : replay.cells,
        selections: replay.selections,
      }),
    )
    const replayCells = replay.cells
    let remoteScopeBinding: RemoteScopeBinding | undefined
    if (identity.subjectKind === 'REMOTE_EVALUATION_SCOPE') {
      const environments = [...new Set(replayCells.map(cell => cell.environmentId))]
      if (environments.length !== 1)
        throw new ServiceError('Remote evaluation scope execution requires its one bound environment.', 'CONFLICT')
      const remoteScope = await remoteScopeCurrentAssertion({
        subjectRevisionId: identity.evaluationSubjectRevisionId,
        targetProjectId: identity.targetProjectId,
        qualityPlanId: identity.qualityPlanId,
        revisionId: identity.qualityPlanRevisionId,
        environmentId: environments[0]!,
      })
      remoteScopeBinding = (remoteScope as { binding?: RemoteScopeBinding } | undefined)?.binding
      if (!remoteScopeBinding)
        throw new ServiceError(
          'Remote evaluation scope guard did not return its immutable environment binding.',
          'CONFLICT',
        )
    }
    try {
      await materializeAssessmentRun({ run: priorRun, identity, cells: replayCells, remoteScopeBinding })
      await markAssessmentRunStarted(priorRun, identity)
      return reconcileQualityAssessmentRun({ assessmentRunId: priorRun.id })
    } catch (error) {
      const reconciled = await reconcileQualityAssessmentRun({ assessmentRunId: priorRun.id })
      if (!reconciled.bindings.length) throw error
      throw recoveryErrorForBindings(identity, reconciled.bindings)
    }
  }
  if (identity.assessmentStatus === 'CANCELLED') throw terminalAssessmentExecutionError(identity)
  const cells = derivedAssessmentCells(effectiveInput, identity)
  const publications = validateCells(cells, identity, effectiveInput.validationVersionIds)
  assertCompletePublishedMatrix(cells, publications)
  let remoteScopeBinding: RemoteScopeBinding | undefined
  if (identity.subjectKind === 'REMOTE_EVALUATION_SCOPE') {
    const environments = [...new Set(cells.map(cell => cell.environmentId))]
    if (environments.length !== 1)
      throw new ServiceError('Remote evaluation scope execution requires its one bound environment.', 'CONFLICT')
    const remoteScope = await remoteScopeCurrentAssertion({
      subjectRevisionId: identity.evaluationSubjectRevisionId,
      targetProjectId: identity.targetProjectId,
      qualityPlanId: identity.qualityPlanId,
      revisionId: identity.qualityPlanRevisionId,
      environmentId: environments[0]!,
    })
    remoteScopeBinding = (remoteScope as { binding?: RemoteScopeBinding } | undefined)?.binding
    if (!remoteScopeBinding)
      throw new ServiceError(
        'Remote evaluation scope guard did not return its immutable environment binding.',
        'CONFLICT',
      )
  }
  await assertManagedRuntimeReady()
  const requestHash = assessmentExecutionRequestHash({
    assessmentId: identity.assessmentId,
    targetProjectId: identity.targetProjectId,
    qualityPlanRevisionId: identity.qualityPlanRevisionId,
    evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
    cells: [...cells].sort((a, b) =>
      `${a.validationVersionId}:${a.resultMatrixCell}`.localeCompare(`${b.validationVersionId}:${b.resultMatrixCell}`),
    ),
    selections: [...publications.values()].map(version => ({
      validationVersionId: version.id,
      generationId: version.activeGeneration!.id,
      generationKey: version.activeGeneration!.generationKey,
      publicationId: version.activeGeneration!.publication!.id,
      publicationOperationHash: version.activeGeneration!.publication!.operationHash,
      runtimeInputHash: version.activeGeneration!.publication!.runtimeInputHash,
    })),
  })
  const idempotencyScope = assessmentIdempotencyScope(identity)
  const authorizationRequest = await prepareCredentialAuthorization({
    input: effectiveInput,
    identity,
    cells,
    publications,
    requestHash,
    idempotencyScope,
  })
  // Credential possession is a narrower gate than execution consent. Do not
  // create or disclose a consent request until the credential grant request is
  // satisfied for this exact immutable execution request.
  if (authorizationRequest) requireAuthorizationGrant(effectiveInput, authorizationRequest)
  const executionConsent = await ensureExecutionConsent({
    input: effectiveInput,
    identity,
    cells,
    publications,
    requestHash,
    authorizationRequest,
    remoteScopeBinding,
  })
  const run = await createAssessmentRun({
    input: effectiveInput,
    identity,
    requestHash,
    idempotencyScope,
    authorizationRequest,
    remoteScopeBinding,
    publications,
    executionConsent,
  })
  // An idempotency key reserves one immutable AssessmentRun. Once it has
  // terminal TestRun history, replaying that key cannot launch new work; a
  // fresh compact preparation key owns the next generation.
  const replayState = assessmentRunReplayState(run)
  if (replayState === 'terminal') throw terminalAssessmentExecutionError(identity)
  if (replayState === 'incomplete') throw incompleteAssessmentExecutionError(identity)
  try {
    await materializeAssessmentRun({ run, identity, cells, publications, remoteScopeBinding })
    await markAssessmentRunStarted(run, identity)
    return reconcileQualityAssessmentRun({ assessmentRunId: run.id })
  } catch (error) {
    // Capsule-start infrastructure failures terminalize their TestRun before
    // rethrowing. Reconcile that durable fact now so the Assessment returns to
    // a stable retryable state without rewriting the failed run or evidence.
    let reconciled: Awaited<ReturnType<typeof reconcileQualityAssessmentRun>>
    try {
      reconciled = await reconcileQualityAssessmentRun({ assessmentRunId: run.id })
    } catch {
      const terminalHistory = await readAssessmentRunBindingState(run.id).catch(() => undefined)
      if (terminalHistory?.allTerminalAndSealed) throw terminalAssessmentExecutionError(identity)
      if (terminalHistory?.hasActiveBinding) throw incompleteAssessmentExecutionError(identity)
      if (terminalHistory?.hasNoBindings) throw error
      throw new ServiceError(
        'Assessment execution recovery could not verify whether terminal TestRun history was sealed.',
        'CONFLICT',
        409,
        { code: 'assessment_execution_recovery_unknown', assessmentId: identity.assessmentId },
      )
    }
    if (!reconciled.bindings.length) throw error
    throw recoveryErrorForBindings(identity, reconciled.bindings)
  }
}

type AssessmentRunBindingState = {
  allTerminalAndSealed: boolean
  hasActiveBinding: boolean
  hasNoBindings: boolean
}

type AssessmentRunReplayInput = {
  status: string
  bindings: Array<{ terminalizedAt: Date | null; evidenceReceiptId: string | null; testRun: { status: TestRunStatus } }>
}

function isZeroBindingTerminalRun(run: AssessmentRunReplayInput) {
  // A stop can win before the first binding exists. That STOPPED run is still
  // immutable terminal history: its Assessment has been CANCELLED and a
  // replay must direct callers to an explicit successor, not reconciliation.
  return !run.bindings.length && (run.status === 'STOPPED' || run.status === 'COMPLETED')
}

function hasOnlyQueuedBindings(run: AssessmentRunReplayInput) {
  return run.bindings.length > 0 && run.bindings.every(binding => binding.testRun.status === TestRunStatus.QUEUED)
}

function hasOnlyTerminalAndSealedBindings(run: AssessmentRunReplayInput) {
  return run.bindings.length > 0 && run.bindings.every(terminalAndSealedBinding)
}

function hasIncompleteAssessmentRunState(run: AssessmentRunReplayInput) {
  return run.status === 'COMPLETED' || run.status === 'STOPPED' || run.bindings.length > 0
}

function assessmentRunReplayState(run: AssessmentRunReplayInput) {
  if (isZeroBindingTerminalRun(run) || hasOnlyTerminalAndSealedBindings(run)) return 'terminal' as const
  if (hasOnlyQueuedBindings(run)) return 'resume' as const
  if (hasIncompleteAssessmentRunState(run)) return 'incomplete' as const
  return 'resume' as const
}

function terminalAndSealedBinding(binding: {
  terminalizedAt: Date | null
  evidenceReceiptId: string | null
  testRun?: { status: TestRunStatus }
}) {
  return Boolean(binding.terminalizedAt || binding.evidenceReceiptId) && (!binding.testRun || terminal(binding.testRun))
}

function recoveryErrorForBindings(
  identity: ExecutionIdentity,
  bindings: Array<{
    terminalizedAt: Date | null
    evidenceReceiptId: string | null
    testRun: { status: TestRunStatus }
  }>,
) {
  if (bindings.length > 0 && bindings.every(terminalAndSealedBinding)) return terminalAssessmentExecutionError(identity)
  return incompleteAssessmentExecutionError(identity)
}

async function readAssessmentRunBindingState(assessmentRunId: string): Promise<AssessmentRunBindingState | undefined> {
  const run = await executionClient.assessmentRun.findUnique({
    where: { id: assessmentRunId },
    include: {
      bindings: {
        select: {
          terminalizedAt: true,
          evidenceReceiptId: true,
          testRun: { select: { status: true } },
        },
      },
    },
  })
  if (!run) return undefined
  return {
    allTerminalAndSealed: run.bindings.length > 0 && run.bindings.every(terminalAndSealedBinding),
    hasActiveBinding: run.bindings.some(binding => !terminal(binding.testRun)),
    hasNoBindings: run.bindings.length === 0,
  }
}

function terminalAssessmentExecutionError(identity: ExecutionIdentity) {
  return new ServiceError(
    'Assessment execution has terminal TestRun history; create an immutable successor before preparing another run.',
    'CONFLICT',
    409,
    {
      code: 'assessment_execution_terminal',
      assessmentId: identity.assessmentId,
      nextRecommendedAction: 'assessment_create_successor',
      nextRequiredAgentBehavior: 'create_successor_then_prepare_with_a_new_idempotency_key',
    },
  )
}

function incompleteAssessmentExecutionError(identity: ExecutionIdentity) {
  return new ServiceError(
    'Assessment execution still has active or unsealed TestRun bindings; wait for them to become terminal, then reconcile before retrying.',
    'CONFLICT',
    409,
    {
      code: 'assessment_execution_incomplete',
      assessmentId: identity.assessmentId,
      nextRecommendedAction: 'assessment_reconcile',
      nextRequiredAgentBehavior: 'wait_for_active_assessment_execution_then_reconcile',
    },
  )
}

function assessmentIdempotencyScope(identity: ExecutionIdentity) {
  return identity.assessmentId
}

function assertCompletePublishedMatrix(cells: RequestedCell[], publications: ReturnType<typeof validateCells>) {
  const supplied = new Set(cells.map(cell => `${cell.validationVersionId}:${cell.resultMatrixCell}`))
  const required = requiredMatrixCells(publications.values())
  if (required.size !== supplied.size || [...required].some(cell => !supplied.has(cell)))
    throw new ServiceError('Assessment execution must cover the complete published validation matrix.', 'VALIDATION')
}

async function priorAssessmentRun(idempotencyScope: string, idempotencyKey: string) {
  const replayClient = executionClient as Partial<Pick<AssessmentExecutionClient, 'assessmentRun'>>
  if (!replayClient.assessmentRun?.findUnique) return null
  return replayClient.assessmentRun.findUnique({
    where: { idempotencyScope_idempotencyKey: { idempotencyScope, idempotencyKey } },
    include: { bindings: { include: { testRun: { select: { status: true } } } } },
  })
}

async function replayExecutionFromCheckpoints(assessmentRunId: string): Promise<{
  cells: RequestedCell[]
  selections: Array<{
    validationVersionId: string
    generationId: string
    generationKey: string
    publicationId: string
    publicationOperationHash: string
    runtimeInputHash: string
  }>
}> {
  const checkpoints = await executionClient.assessmentRunPublicationCheckpoint.findMany({
    where: { assessmentRunId },
    include: { publication: { include: { generation: true } } },
    orderBy: { validationVersionId: 'asc' },
  })
  if (!checkpoints.length)
    throw new ServiceError('AssessmentRun has no durable publication checkpoints for safe replay.', 'CONFLICT')
  const cells = checkpoints.flatMap(checkpoint => {
    let runtimeInput: { matrix?: Array<{ browser: string; environment: string }> }
    try {
      runtimeInput = JSON.parse(checkpoint.publication.runtimeInputJson) as typeof runtimeInput
    } catch {
      throw new ServiceError('AssessmentRun checkpoint has invalid immutable runtime input.', 'CONFLICT')
    }
    if (!runtimeInput.matrix?.length)
      throw new ServiceError('AssessmentRun checkpoint has no immutable runtime matrix.', 'CONFLICT')
    return runtimeInput.matrix.map(cell => {
      const browserEngine = cell.browser.toUpperCase() as BrowserEngine
      if (!Object.values(BrowserEngine).includes(browserEngine))
        throw new ServiceError(`AssessmentRun checkpoint has unsupported browser "${cell.browser}".`, 'CONFLICT')
      return {
        validationVersionId: checkpoint.validationVersionId,
        resultMatrixCell: `${browserEngine}:${cell.environment}`,
        environmentId: cell.environment,
        browserEngine,
      }
    })
  })
  return {
    cells,
    selections: checkpoints.map(checkpoint => ({
      validationVersionId: checkpoint.validationVersionId,
      generationId: checkpoint.generationId,
      generationKey: checkpoint.publication.generation.generationKey,
      publicationId: checkpoint.publicationId,
      publicationOperationHash: checkpoint.publicationOperationHash,
      runtimeInputHash: checkpoint.runtimeInputHash,
    })),
  }
}

function assertMatchingRequestHash(run: { requestHash: string } | null, requestHash: string) {
  if (run && run.requestHash !== requestHash)
    throw new ServiceError('Assessment execution idempotency key has different request content.', 'CONFLICT')
}

function credentialScopeFor<
  T extends {
    activeGeneration: {
      id: string
      publication: { id: string; operationHash: string; runtimeInputHash: string; runtimeInputJson: string } | null
    } | null
  },
>(input: { identity: ExecutionIdentity; cells: RequestedCell[]; publications: Map<string, T>; requestHash: string }) {
  const { identity, cells, publications, requestHash } = input
  return credentialAuthorizationService.credentialAuthorizationInput({
    assessmentId: identity.assessmentId!,
    targetProjectId: identity.targetProjectId,
    qualityPlanId: identity.qualityPlanId,
    qualityPlanRevisionId: identity.qualityPlanRevisionId,
    evaluationSubjectRevisionId: identity.evaluationSubjectRevisionId,
    subjectDigest: identity.subjectDigest,
    environmentId: cells[0]!.environmentId,
    publications: [...publications.values()].map(version => ({
      generationId: version.activeGeneration!.id,
      publicationId: version.activeGeneration!.publication!.id,
      operationHash: version.activeGeneration!.publication!.operationHash,
      runtimeInputHash: version.activeGeneration!.publication!.runtimeInputHash,
      runtimeInputJson: version.activeGeneration!.publication!.runtimeInputJson,
    })),
    requestHash,
  })
}

async function prepareCredentialAuthorization<
  T extends {
    activeGeneration: {
      id: string
      publication: { id: string; operationHash: string; runtimeInputHash: string; runtimeInputJson: string } | null
    } | null
  },
>(input: {
  input: AssessmentRunInput
  identity: ExecutionIdentity
  cells: RequestedCell[]
  publications: Map<string, T>
  requestHash: string
  idempotencyScope: string
}) {
  const credentialRequired = (
    await Promise.all(
      input.cells.map(cell => credentialAuthorizationService.executionRequiresCredential(cell.environmentId)),
    )
  ).some(Boolean)
  if (!credentialRequired) return undefined
  if (new Set(input.cells.map(cell => cell.environmentId)).size !== 1)
    throw new ServiceError('Credential execution requires one exact environment scope.', 'CONFLICT')
  const priorRun = await priorAssessmentRun(input.idempotencyScope, input.input.idempotencyKey)
  assertMatchingRequestHash(priorRun, input.requestHash)
  if (priorRun) return undefined
  return credentialAuthorizationService.ensureCredentialExecutionRequest(
    credentialScopeFor({
      identity: input.identity,
      cells: input.cells,
      publications: input.publications,
      requestHash: input.requestHash,
    }),
  )
}

function requireAuthorizationGrant(
  input: AssessmentRunInput,
  authorizationRequest: Awaited<ReturnType<typeof ensureCredentialExecutionRequest>>,
) {
  if (
    !input.authorizationGrantId ||
    input.executionRequestId !== authorizationRequest.id ||
    input.expectedRequestHash !== authorizationRequest.requestHash
  )
    throw new ServiceError('AUTHORIZATION_REQUIRED', 'UNAUTHORIZED', 403, {
      requestId: authorizationRequest.id,
      requestHash: authorizationRequest.requestHash,
      expiresAt: authorizationRequest.expiresAt.toISOString(),
      authorization: {
        executionRequestId: authorizationRequest.id,
        expectedRequestHash: authorizationRequest.requestHash,
        expiresAt: authorizationRequest.expiresAt.toISOString(),
        authorizationRequestCreated: true,
        nextAction: {
          tool: 'assessment_prepare_run',
          reason:
            'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
        },
      },
      issuerLabel: 'Local Appraise UI session (unauthenticated local possession)',
    })
  return input.authorizationGrantId
}

async function authorizeAssessmentRunCreation(
  tx: Prisma.TransactionClient,
  input: AssessmentRunInput,
  identity: ExecutionIdentity,
  authorizationRequest: Awaited<ReturnType<typeof ensureCredentialExecutionRequest>> | undefined,
) {
  if (!authorizationRequest) {
    await reserveCurrentReadyAssessment(tx, identity)
    return undefined
  }
  const grantId = requireAuthorizationGrant(input, authorizationRequest)
  await reserveCurrentReadyAssessment(tx, identity)
  await credentialAuthorizationService.consumeCredentialExecutionGrant(tx, {
    grantId,
    requestId: authorizationRequest.id,
    requestHash: authorizationRequest.requestHash,
  })
  return grantId
}

type PreparedExecutionConsent = { id: string; manifestHash: string }

/**
 * Until the operation registry supplies a complete effect classification, any
 * executable step or extension is treated as a material, unclassified effect.
 * A caller may request stricter consent but can never downgrade that guard.
 */
export function deriveExecutionEffects(identity: ExecutionIdentity, cells: RequestedCell[]) {
  const selected = new Set(cells.map(cell => cell.validationVersionId))
  const hasUnclassifiedOperation = identity.versions.some(version => {
    if (!selected.has(version.id)) return false
    const legacyPublication = (version as unknown as { publication?: { runtimeInputJson?: string } }).publication
    const runtimeInputJson =
      version.activeGeneration?.publication?.runtimeInputJson ?? legacyPublication?.runtimeInputJson
    if (!runtimeInputJson) return true
    try {
      const runtimeInput = JSON.parse(runtimeInputJson) as { stepDefinitions?: unknown[]; extensions?: unknown[] }
      return Boolean(runtimeInput.stepDefinitions?.length || runtimeInput.extensions?.length)
    } catch {
      return true
    }
  })
  return hasUnclassifiedOperation
    ? {
        riskClassification: 'MATERIAL_EFFECT' as const,
        materialEffects: ['UNCLASSIFIED_OPERATION' as const],
      }
    : { riskClassification: 'READ_ONLY' as const, materialEffects: [] }
}

// fallow-ignore-next-line complexity -- consent policy, immutable publication selection, and replay safety form one boundary.
async function ensureExecutionConsent(input: {
  input: AssessmentRunInput
  identity: ExecutionIdentity
  cells: RequestedCell[]
  publications: Map<
    string,
    {
      id: string
      activeGeneration: {
        id: string
        generationKey: string
        publication: { id: string; operationHash: string; runtimeInputHash: string } | null
      } | null
    }
  >
  requestHash: string
  authorizationRequest: Awaited<ReturnType<typeof ensureCredentialExecutionRequest>> | undefined
  remoteScopeBinding?: RemoteScopeBinding
}): Promise<PreparedExecutionConsent> {
  const derivedEffects = deriveExecutionEffects(input.identity, input.cells)
  const declaredMaterialEffects = [...new Set(input.input.materialEffects ?? [])].sort()
  const materialEffects = [...new Set([...derivedEffects.materialEffects, ...declaredMaterialEffects])].sort()
  const riskClassification: NonNullable<Parameters<typeof consentPolicy>[0]['riskClassification']> =
    input.input.riskClassification === 'MATERIAL_EFFECT' || derivedEffects.riskClassification === 'MATERIAL_EFFECT'
      ? 'MATERIAL_EFFECT'
      : input.input.riskClassification === 'REVERSIBLE_WRITE'
        ? 'REVERSIBLE_WRITE'
        : 'READ_ONLY'
  const manifest = {
    schema: 'appraise.execution-manifest/v2',
    assessmentId: input.identity.assessmentId,
    targetProjectId: input.identity.targetProjectId,
    targetKind: input.identity.targetKind,
    qualityPlanRevisionId: input.identity.qualityPlanRevisionId,
    evaluationSubjectRevisionId: input.identity.evaluationSubjectRevisionId,
    requestHash: input.requestHash,
    credentialRequired: Boolean(input.authorizationRequest),
    declaredRiskClassification: input.input.riskClassification ?? null,
    declaredMaterialEffects,
    riskClassification,
    materialEffects,
    selections: [...input.publications.values()]
      .map(version => ({
        validationVersionId: version.id,
        generationId: version.activeGeneration!.id,
        generationKey: version.activeGeneration!.generationKey,
        publicationId: version.activeGeneration!.publication!.id,
        publicationOperationHash: version.activeGeneration!.publication!.operationHash,
        runtimeInputHash: version.activeGeneration!.publication!.runtimeInputHash,
      }))
      .sort((left, right) => left.validationVersionId.localeCompare(right.validationVersionId)),
    cells: [...input.cells].sort((left, right) =>
      `${left.validationVersionId}:${left.resultMatrixCell}`.localeCompare(
        `${right.validationVersionId}:${right.resultMatrixCell}`,
      ),
    ),
    remoteEnvironmentSnapshotHash: input.remoteScopeBinding?.environmentSnapshotHash ?? null,
  }
  const manifestHash = hash(manifest)
  if (input.input.expectedExecutionManifestHash && input.input.expectedExecutionManifestHash !== manifestHash)
    throw new ServiceError('Execution manifest hash is stale.', 'CONFLICT')
  const [project, assessment, existing] = await Promise.all([
    executionClient.targetProject.findUnique({
      where: { id: input.identity.targetProjectId },
      select: { executionConsentMode: true },
    }),
    executionClient.assessment.findUnique({
      where: { id: input.identity.assessmentId },
      select: { executionManifestHash: true, executionConsentSnapshotHash: true },
    }),
    executionClient.executionConsent.findUnique({ where: { assessmentId: input.identity.assessmentId } }),
  ])
  if (!project || !assessment) throw new ServiceError('Execution consent scope is unavailable.', 'NOT_FOUND')
  if (assessment.executionManifestHash && assessment.executionManifestHash !== manifestHash)
    throw new ServiceError('Execution inputs changed after consent was requested.', 'CONFLICT')
  if (existing) {
    if (existing.executionManifestHash !== manifestHash)
      throw new ServiceError('Execution consent belongs to a stale manifest.', 'CONFLICT')
    if (existing.status !== 'GRANTED' || input.input.consentId !== existing.id)
      throw new ServiceError('Explicit execution consent is required.', 'CONFLICT', 409, {
        consentId: existing.id,
        executionManifestHash: manifestHash,
        consentStatus: existing.status,
      })
    return { id: existing.id, manifestHash }
  }
  const { explicitConsentRequired } = consentPolicy({
    projectMode: project.executionConsentMode,
    credentialRequired: manifest.credentialRequired,
    materialEffects: manifest.materialEffects,
    riskClassification: manifest.riskClassification,
  })
  const scopeJson = canonicalContractJson(manifest)
  const created = await executionClient.$transaction(async transaction => {
    await transaction.assessment.update({
      where: { id: input.identity.assessmentId },
      data: { executionManifestHash: manifestHash },
    })
    return transaction.executionConsent.create({
      data: {
        targetProjectId: input.identity.targetProjectId,
        assessmentId: input.identity.assessmentId,
        executionManifestHash: manifestHash,
        mode: project.executionConsentMode,
        status: explicitConsentRequired ? 'REQUESTED' : 'GRANTED',
        scopeJson,
        consentHash: hash({ manifestHash, mode: project.executionConsentMode, scopeJson }),
        ...(explicitConsentRequired ? {} : { grantedBy: 'appraise-policy', grantedAt: new Date() }),
      },
    })
  })
  if (explicitConsentRequired)
    throw new ServiceError('Explicit execution consent is required.', 'CONFLICT', 409, {
      assessmentId: input.identity.assessmentId,
      consentId: created.id,
      executionManifestHash: manifestHash,
      consentStatus: created.status,
      consentRequestCreated: true,
    })
  return { id: created.id, manifestHash }
}

async function createAssessmentRun(input: {
  input: AssessmentRunInput
  identity: ExecutionIdentity
  requestHash: string
  idempotencyScope: string
  authorizationRequest: Awaited<ReturnType<typeof ensureCredentialExecutionRequest>> | undefined
  remoteScopeBinding?: RemoteScopeBinding
  executionConsent: PreparedExecutionConsent
  publications: Map<
    string,
    {
      id: string
      activeGeneration: {
        id: string
        publication: { id: string; operationHash: string; runtimeInputHash: string } | null
      } | null
    }
  >
}) {
  return executionClient.$transaction(async tx => {
    const existing = await tx.assessmentRun.findUnique({
      where: {
        idempotencyScope_idempotencyKey: {
          idempotencyScope: input.idempotencyScope,
          idempotencyKey: input.input.idempotencyKey,
        },
      },
      include: {
        bindings: {
          select: {
            terminalizedAt: true,
            evidenceReceiptId: true,
            testRun: { select: { status: true } },
          },
        },
      },
    })
    assertMatchingRequestHash(existing, input.requestHash)
    if (existing) return existing
    if (input.remoteScopeBinding)
      await remoteScopeCurrentAssertion(
        {
          subjectRevisionId: input.identity.evaluationSubjectRevisionId,
          targetProjectId: input.identity.targetProjectId,
          qualityPlanId: input.identity.qualityPlanId,
          revisionId: input.identity.qualityPlanRevisionId,
          environmentId: input.remoteScopeBinding.environmentId,
        },
        tx,
      )
    const grantId = await authorizeAssessmentRunCreation(tx, input.input, input.identity, input.authorizationRequest)
    const consent = await tx.executionConsent.findUnique({ where: { id: input.executionConsent.id } })
    if (
      !consent ||
      consent.status !== 'GRANTED' ||
      consent.executionManifestHash !== input.executionConsent.manifestHash
    )
      throw new ServiceError('Execution consent is not active for this manifest.', 'CONFLICT')
    if (consent.expiresAt && consent.expiresAt <= new Date()) {
      await tx.executionConsent.update({ where: { id: consent.id }, data: { status: 'EXPIRED' } })
      throw new ServiceError('Execution consent has expired.', 'CONFLICT')
    }
    const created = await tx.assessmentRun.create({
      data: {
        assessmentId: input.identity.assessmentId,
        targetProjectId: input.identity.targetProjectId,
        qualityPlanRevisionId: input.identity.qualityPlanRevisionId,
        evaluationSubjectRevisionId: input.identity.evaluationSubjectRevisionId,
        idempotencyScope: input.idempotencyScope,
        idempotencyKey: input.input.idempotencyKey,
        requestHash: input.requestHash,
        ...(input.authorizationRequest
          ? {
              executionRequestId: input.authorizationRequest.id,
              executionRequestHash: input.authorizationRequest.requestHash,
              executionAuthorizationGrantId: grantId!,
            }
          : {}),
      },
      include: { bindings: { include: { testRun: { select: { status: true } } } } },
    })
    const consumedAt = new Date()
    const snapshot = {
      consentHash: consent.consentHash,
      consumedAt: consumedAt.toISOString(),
      executionManifestHash: consent.executionManifestHash,
      mode: consent.mode,
    }
    await tx.executionConsent.update({ where: { id: consent.id }, data: { status: 'CONSUMED', consumedAt } })
    await tx.assessment.update({
      where: { id: input.identity.assessmentId },
      data: {
        executionConsentSnapshotJson: canonicalContractJson(snapshot),
        executionConsentSnapshotHash: hash(snapshot),
      },
    })
    await tx.assessmentRunPublicationCheckpoint.createMany({
      data: [...input.publications.values()].map(version => ({
        assessmentRunId: created.id,
        targetProjectId: input.identity.targetProjectId,
        qualityPlanRevisionId: input.identity.qualityPlanRevisionId,
        validationVersionId: version.id,
        generationId: version.activeGeneration!.id,
        publicationId: version.activeGeneration!.publication!.id,
        publicationOperationHash: version.activeGeneration!.publication!.operationHash,
        runtimeInputHash: version.activeGeneration!.publication!.runtimeInputHash,
      })),
    })
    return created
  })
}

function stopped(status: string) {
  return status === 'STOP_REQUESTED' || status === 'STOPPED'
}

async function runStatus(runId: string) {
  return executionClient.assessmentRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true } })
}

function bindingKey(versionId: string, cell: RequestedCell) {
  return `${versionId}:${cell.resultMatrixCell}`
}

function assertBindingContent(
  binding: {
    runtimeInputHash: string
    generationId?: string | null
    publicationId?: string | null
    publicationOperationHash?: string | null
  },
  publication: { id: string; generationId: string; operationHash: string; runtimeInputHash: string },
) {
  if (
    binding.runtimeInputHash !== publication.runtimeInputHash ||
    binding.generationId !== publication.generationId ||
    binding.publicationId !== publication.id ||
    binding.publicationOperationHash !== publication.operationHash
  )
    throw new ServiceError('Concurrent AssessmentRun binding has different immutable execution content.', 'CONFLICT')
}

async function startExistingBinding(input: {
  binding: {
    runtimeInputHash: string
    generationId: string | null
    publicationId: string | null
    publicationOperationHash: string | null
    testRun: { status: TestRunStatus; name: string; browserEngine: BrowserEngine }
    testRunId: string
  }
  publication: { id: string; generationId: string; operationHash: string; runtimeInputHash: string }
  versionId: string
  identity: ExecutionIdentity
  cell: RequestedCell
  runtime: RuntimeService
}) {
  assertBindingContent(input.binding, input.publication)
  if (input.binding.testRun.status !== TestRunStatus.QUEUED) return
  await input.runtime.startQuality({
    publicationId: input.publication.id,
    validationVersionId: input.versionId,
    targetProjectId: input.identity.targetProjectId,
    environmentId: input.cell.environmentId,
    name: input.binding.testRun.name,
    browserEngine: input.binding.testRun.browserEngine,
    testRunDbId: input.binding.testRunId,
  })
}

async function prepareAndStartBinding(input: {
  run: { id: string }
  identity: ExecutionIdentity
  cell: RequestedCell
  version: {
    id: string
    activeGeneration: {
      id: string
      publication: { id: string; generationId: string; operationHash: string; runtimeInputHash: string } | null
    } | null
  }
  runtime: RuntimeService
  remoteScopeBinding?: RemoteScopeBinding
}) {
  const generation = input.version.activeGeneration!
  const publication = generation.publication!
  const prepared = await input.runtime.prepareQuality({
    publicationId: publication.id,
    validationVersionId: input.version.id,
    targetProjectId: input.identity.targetProjectId,
    environmentId: input.cell.environmentId,
    name: `assessment:${input.run.id}:${input.cell.resultMatrixCell}`,
    browserEngine: input.cell.browserEngine ?? BrowserEngine.CHROMIUM,
    assessmentRunId: input.run.id,
    preparationKey: hash({
      assessmentRunId: input.run.id,
      targetProjectId: input.identity.targetProjectId,
      qualityPlanRevisionId: input.identity.qualityPlanRevisionId,
      validationVersionId: input.version.id,
      cell: input.cell.resultMatrixCell,
    }),
    ...(input.remoteScopeBinding
      ? {
          environmentSnapshot: {
            hash: input.remoteScopeBinding.environmentSnapshotHash,
            json: input.remoteScopeBinding.environmentSnapshotJson,
            version: input.remoteScopeBinding.environmentScopeVersion ?? 1,
          },
        }
      : {}),
  })
  const binding = await executionClient.assessmentRunBinding.upsert({
    where: {
      assessmentRunId_validationVersionId_resultMatrixCell: {
        assessmentRunId: input.run.id,
        validationVersionId: input.version.id,
        resultMatrixCell: input.cell.resultMatrixCell,
      },
    },
    create: {
      assessmentRunId: input.run.id,
      targetProjectId: input.identity.targetProjectId,
      qualityPlanRevisionId: input.identity.qualityPlanRevisionId,
      validationVersionId: input.version.id,
      resultMatrixCell: input.cell.resultMatrixCell,
      testRunId: prepared.id,
      runtimeInputHash: publication.runtimeInputHash,
      generationId: generation.id,
      publicationId: publication.id,
      publicationOperationHash: publication.operationHash,
    },
    update: {},
  })
  assertBindingContent(binding, publication)
  if (binding.testRunId !== prepared.id)
    throw new ServiceError('Concurrent AssessmentRun binding has different immutable execution content.', 'CONFLICT')
  if (stopped((await runStatus(input.run.id)).status)) return input.runtime.cancel(prepared.id)
  return input.runtime.startQuality({
    publicationId: publication.id,
    validationVersionId: input.version.id,
    targetProjectId: input.identity.targetProjectId,
    environmentId: input.cell.environmentId,
    name: prepared.name,
    browserEngine: prepared.browserEngine,
    testRunDbId: prepared.id,
  })
}

async function materializeAssessmentRun<
  T extends {
    id: string
    activeGeneration: {
      id: string
      publication: { id: string; generationId: string; operationHash: string; runtimeInputHash: string } | null
    } | null
  },
>(input: {
  run: { id: string }
  identity: ExecutionIdentity
  cells: RequestedCell[]
  publications?: Map<string, T>
  remoteScopeBinding?: RemoteScopeBinding
}) {
  const durableBindings = await executionClient.assessmentRunBinding.findMany({
    where: { assessmentRunId: input.run.id },
    include: { testRun: true },
  })
  const existingBindings = new Map(
    durableBindings.map(binding => [`${binding.validationVersionId}:${binding.resultMatrixCell}`, binding]),
  )
  const checkpoints = await executionClient.assessmentRunPublicationCheckpoint.findMany({
    where: { assessmentRunId: input.run.id },
    include: { publication: { include: { generation: true } } },
  })
  const checkpointByValidation = new Map(checkpoints.map(checkpoint => [checkpoint.validationVersionId, checkpoint]))
  const runtime = runtimeServiceFactory()
  for (const cell of input.cells) {
    if (stopped((await runStatus(input.run.id)).status)) break
    const checkpoint = checkpointByValidation.get(cell.validationVersionId)
    if (
      !checkpoint ||
      checkpoint.generationId !== checkpoint.publication.generation.id ||
      checkpoint.publicationId !== checkpoint.publication.id ||
      checkpoint.publicationOperationHash !== checkpoint.publication.operationHash ||
      checkpoint.publication.generationId !== checkpoint.generationId ||
      checkpoint.publication.validationVersionId !== checkpoint.validationVersionId ||
      checkpoint.runtimeInputHash !== checkpoint.publication.runtimeInputHash
    )
      throw new ServiceError(
        'AssessmentRun checkpoint does not contain one exact executable generation and publication.',
        'CONFLICT',
      )
    const version = input.publications?.get(cell.validationVersionId) ?? {
      id: checkpoint.validationVersionId,
      activeGeneration: { id: checkpoint.publication.generation.id, publication: checkpoint.publication },
    }
    if (
      version.activeGeneration?.id !== checkpoint.generationId ||
      version.activeGeneration.publication?.id !== checkpoint.publicationId ||
      version.activeGeneration.publication?.operationHash !== checkpoint.publicationOperationHash
    )
      throw new ServiceError('AssessmentRun replay cannot substitute a current active generation.', 'CONFLICT')
    const existing = existingBindings.get(bindingKey(version.id, cell))
    if (existing)
      await startExistingBinding({
        binding: existing,
        publication: version.activeGeneration!.publication!,
        versionId: version.id,
        identity: input.identity,
        cell,
        runtime,
      })
    else
      await prepareAndStartBinding({
        run: input.run,
        identity: input.identity,
        cell,
        version,
        runtime,
        remoteScopeBinding: input.remoteScopeBinding,
      })
  }
}

async function markAssessmentRunStarted(run: { id: string }, identity: ExecutionIdentity) {
  const started = await executionClient.assessmentRun.updateMany({
    where: { id: run.id, status: 'PREPARED' },
    data: { status: 'RUNNING', version: { increment: 1 } },
  })
  if (identity.assessmentId && started.count)
    await executionClient.assessment.updateMany({
      where: { id: identity.assessmentId, status: 'READY' },
      data: { status: 'RUNNING' },
    })
}

function assessmentExecutionRequestHash(value: {
  assessmentId: string | null
  targetProjectId: string
  qualityPlanRevisionId: string
  evaluationSubjectRevisionId: string
  cells: RequestedCell[]
  selections: Array<{
    validationVersionId: string
    generationId: string
    generationKey: string
    publicationId: string
    publicationOperationHash: string
    runtimeInputHash: string
  }>
}) {
  return hash({
    assessmentId: value.assessmentId,
    targetProjectId: value.targetProjectId,
    qualityPlanRevisionId: value.qualityPlanRevisionId,
    evaluationSubjectRevisionId: value.evaluationSubjectRevisionId,
    cells: [...value.cells].sort((a, b) =>
      `${a.validationVersionId}:${a.resultMatrixCell}`.localeCompare(`${b.validationVersionId}:${b.resultMatrixCell}`),
    ),
    selections: [...value.selections].sort((a, b) => a.validationVersionId.localeCompare(b.validationVersionId)),
  })
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
  if (run.result === TestRunResult.BLOCKED) return 'BLOCKED' as const
  if (run.result === TestRunResult.FAILED) return 'FAILED' as const
  return 'INCONCLUSIVE' as const
}

function terminal(run: { status: TestRunStatus }) {
  return run.status === TestRunStatus.COMPLETED || run.status === TestRunStatus.CANCELLED
}

function hasHumanVerificationTerminalEvent(logs: string | null | undefined) {
  return Boolean(findHumanVerificationEvent(logs))
}

function evidenceEligible(run: {
  status: TestRunStatus
  result: TestRunResult
  evidenceHealth: TestRunEvidenceHealth
  runtimeCapsule: { integrityState: string } | null
  logs?: { logs: string } | null
}) {
  return (
    run.status === TestRunStatus.COMPLETED &&
    (run.result === TestRunResult.PASSED ||
      run.result === TestRunResult.FAILED ||
      (run.result === TestRunResult.BLOCKED && hasHumanVerificationTerminalEvent(run.logs?.logs))) &&
    run.evidenceHealth === TestRunEvidenceHealth.valid &&
    run.runtimeCapsule?.integrityState === 'ready'
  )
}

function assuranceFor(generation: { assuranceLevel: string }) {
  if (Object.values(AssuranceLevel).includes(generation.assuranceLevel as AssuranceLevel))
    return generation.assuranceLevel as AssuranceLevel
  throw new ServiceError('AssessmentRun generation lacks a supported sealed assurance level.', 'CONFLICT')
}

type TerminalBinding = {
  id: string
  version: number
  testRun: { completedAt: Date | null }
}

type ManagedIntegrityRejectionCode = 'managed_capsule_integrity' | 'remote_environment_packet_integrity'

async function terminalizeBinding(
  binding: TerminalBinding,
  terminalOutcome: 'PASSED' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE',
  evidenceReceiptId?: string,
  integrityRejectionCode?: ManagedIntegrityRejectionCode,
) {
  await executionClient.assessmentRunBinding.updateMany({
    where: { id: binding.id, version: binding.version, evidenceReceiptId: null },
    data: {
      ...(evidenceReceiptId ? { evidenceReceiptId } : {}),
      ...(integrityRejectionCode ? { integrityRejectionCode } : {}),
      terminalOutcome,
      terminalizedAt: binding.testRun.completedAt ?? new Date(),
      version: { increment: 1 },
    },
  })
}

async function markBindingInconclusive(
  binding: TerminalBinding,
  integrityRejectionCode?: ManagedIntegrityRejectionCode,
) {
  await terminalizeBinding(binding, 'INCONCLUSIVE', undefined, integrityRejectionCode)
}

type ExpectedCaseTuple = { validationId: string; suiteId: string; caseId: string; scenarioId: string }

/**
 * Re-derive the complete execution selection from the immutable publication
 * bytes. A capsule's expected-cases file is only an output of that selection;
 * a self-consistently rehashed replacement must not be able to name another
 * suite, case, or scenario.
 */
function expectedCasesFromBoundPublication(input: {
  astId: string
  validationProjectionJson: string
  runtimeInputJson: string
}) {
  const projection = validationArtifactSchema.parse(JSON.parse(input.validationProjectionJson))
  const node = projection.validations.filter(item => item.id === input.astId)
  if (node.length !== 1) throw new Error('Publication must contain exactly one selected validation AST.')
  const validation = node[0]!
  const runtime = JSON.parse(input.runtimeInputJson) as {
    astId?: unknown
    expected?: { scenarioCount?: unknown; scenarios?: unknown }
  }
  if (runtime.astId !== input.astId || !runtime.expected || !Array.isArray(runtime.expected.scenarios))
    throw new Error('Publication runtime input does not identify its selected validation AST.')
  if (runtime.expected.scenarioCount !== runtime.expected.scenarios.length)
    throw new Error('Publication runtime input has an inconsistent scenario count.')
  const scenarios = runtime.expected.scenarios.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Publication runtime input has an invalid scenario.')
    const scenario = value as Record<string, unknown>
    if (
      typeof scenario.scenarioId !== 'string' ||
      typeof scenario.caseId !== 'string' ||
      !Array.isArray(scenario.stepIds)
    )
      throw new Error('Publication runtime input has an invalid scenario tuple.')
    return { scenarioId: scenario.scenarioId, caseId: scenario.caseId }
  })
  const scenarioByCase = new Map(scenarios.map(scenario => [scenario.caseId, scenario]))
  if (scenarioByCase.size !== scenarios.length)
    throw new Error('Publication runtime input has duplicate case scenarios.')
  const suiteByCase = new Map<string, string>()
  for (const suite of validation.appraiseArtifacts.testSuites)
    for (const caseId of suite.testCaseIds) {
      if (suiteByCase.has(caseId)) throw new Error('Publication validation AST assigns a case to multiple suites.')
      suiteByCase.set(caseId, suite.id)
    }
  if (suiteByCase.size !== validation.appraiseArtifacts.testCases.length)
    throw new Error('Publication validation AST has incomplete suite/case coverage.')
  const tuples = validation.appraiseArtifacts.testCases.map(testCase => {
    const suiteId = suiteByCase.get(testCase.id)
    const scenario = scenarioByCase.get(testCase.id)
    if (!suiteId || !scenario) throw new Error('Publication AST and runtime scenario selection disagree.')
    return { validationId: validation.id, suiteId, caseId: testCase.id, scenarioId: scenario.scenarioId }
  })
  if (tuples.length !== scenarios.length) throw new Error('Publication has an unexpected scenario cardinality.')
  return tuples.sort((left, right) =>
    `${left.validationId}/${left.suiteId}/${left.caseId}/${left.scenarioId}`.localeCompare(
      `${right.validationId}/${right.suiteId}/${right.caseId}/${right.scenarioId}`,
    ),
  )
}

function hasExactExpectedCaseTuples(actual: ExpectedCaseTuple[], expected: ExpectedCaseTuple[]) {
  const orderedActual = [...actual].sort((left, right) =>
    `${left.validationId}/${left.suiteId}/${left.caseId}/${left.scenarioId}`.localeCompare(
      `${right.validationId}/${right.suiteId}/${right.caseId}/${right.scenarioId}`,
    ),
  )
  return canonicalContractJson(orderedActual) === canonicalContractJson(expected)
}

/**
 * Evidence is a statement about the exact managed publication that prepared
 * this TestRun, not merely about bytes that happen to look like a capsule.
 * Parse and re-hash the canonical manifest immediately before any artifact
 * bytes are read.  This deliberately has no fallback for an authored
 * snapshot: Assessment bindings are published-validation authority only.
 */
function managedCapsuleMatchesAssessmentBinding(input: {
  run: { id: string; targetProjectId: string; runId: string; intent: string }
  capsule: {
    targetProjectId: string
    testRunId: string
    validationHash: string
    qualityPublicationId: string | null
    manifestJson: string
    manifestHash: string
    capsuleHash: string
  } | null
  binding: {
    validationVersionId: string
    generationId: string | null
    publicationId: string | null
    publicationOperationHash: string | null
    runtimeInputHash: string
    generation: { id: string; generationKey: string } | null
    publication: {
      id: string
      generationId: string
      validationVersionId: string
      operationHash: string
      validationHash: string
      astId: string
      projectionHash: string
      receiptHash: string
      runtimeInputHash: string
      validationProjectionJson: string
      runtimeInputJson: string
    } | null
  }
}) {
  const { run, capsule, binding } = input
  if (
    !capsule ||
    !binding.generationId ||
    !binding.publicationId ||
    !binding.publicationOperationHash ||
    !binding.generation ||
    !binding.publication ||
    run.intent !== 'ASSESSMENT' ||
    capsule.targetProjectId !== run.targetProjectId ||
    capsule.testRunId !== run.id ||
    capsule.validationHash !== binding.publication.validationHash ||
    capsule.qualityPublicationId !== binding.publicationId
  ) {
    return false
  }
  try {
    const manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson)
    const publication = binding.publication
    const matches =
      capsule.manifestHash === hashRuntimeCapsuleValue(manifest) &&
      capsule.capsuleHash === hashRuntimeCapsuleValue({ ...manifest, manifestHash: capsule.manifestHash }) &&
      manifest.projectId === run.targetProjectId &&
      manifest.runId === run.runId &&
      manifest.validationHash === publication.validationHash &&
      manifest.operationHash === publication.operationHash &&
      manifest.projectionHash === publication.projectionHash &&
      manifest.receiptHash === publication.receiptHash &&
      manifest.runtimeInputHash === binding.runtimeInputHash &&
      manifest.runtimeInputHash === publication.runtimeInputHash &&
      manifest.source.kind === 'PUBLISHED_VALIDATION' &&
      manifest.source.sourceHash === publication.validationHash &&
      manifest.source.publishOperationId === publication.id &&
      manifest.source.generationId === binding.generationId &&
      manifest.source.generationId === publication.generationId &&
      manifest.source.generationKey === binding.generation.generationKey &&
      manifest.expectedCases.length > 0 &&
      hasExactExpectedCaseTuples(
        manifest.expectedCases,
        expectedCasesFromBoundPublication({
          astId: publication.astId,
          validationProjectionJson: publication.validationProjectionJson,
          runtimeInputJson: publication.runtimeInputJson,
        }),
      )
    return matches
  } catch {
    return false
  }
}

/** Reconciliation treats TestRun terminal state as authoritative. Receipt
 * hashes are calculated from artifact bytes (never their paths), then an
 * optimistic binding update preserves the first terminal outcome in races. */
async function reconcileQualityAssessmentRun(input: { assessmentRunId: string }) {
  const run = await executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: input.assessmentRunId },
    include: {
      bindings: {
        include: {
          validationVersion: true,
          generation: true,
          publication: true,
          testRun: {
            include: {
              environment: true,
              // The durable TestRun owner is the authoritative remote/local
              // classification. A legacy Assessment subject may still be an
              // ARTIFACT or DEPLOYMENT_SNAPSHOT, but it must never allow an
              // unsealed remote TestRun to bypass packet integrity.
              targetProject: { select: { kind: true } },
              logs: true,
              runtimeCapsule: true,
              testCases: { select: { tracePath: true } },
            },
          },
        },
      },
      assessment: true,
      evaluationSubjectRevision: true,
    },
  })
  for (const binding of run.bindings) {
    if (binding.evidenceReceiptId || !terminal(binding.testRun)) continue
    if (
      !binding.generationId ||
      !binding.publicationId ||
      !binding.publicationOperationHash ||
      !binding.generation ||
      !binding.publication ||
      binding.generation.id !== binding.generationId ||
      binding.publication.id !== binding.publicationId ||
      binding.publication.generationId !== binding.generationId ||
      binding.publication.operationHash !== binding.publicationOperationHash ||
      binding.publication.validationVersionId !== binding.validationVersionId ||
      binding.publication.runtimeInputHash !== binding.runtimeInputHash
    ) {
      // Historical unbound rows remain inspectable, but they cannot produce
      // v3 managed evidence by resolving whatever selector is current today.
      await markBindingInconclusive(binding, 'managed_capsule_integrity')
      continue
    }
    const remoteScope = binding.testRun.targetProject?.kind === 'REMOTE_BLACK_BOX'
    // Remote execution identity is a prerequisite for *classifying* any
    // terminal target outcome. A corrupt packet must not be relabelled as a
    // target FAIL/BLOCKED/PASS merely because evidence health or artifacts
    // are also bad; it is strictly not evaluated.
    let remoteEnvironmentSnapshotHash: string | undefined
    if (remoteScope) {
      try {
        remoteEnvironmentSnapshotHash = sealedEnvironmentSnapshot(binding.testRun, true)
      } catch {
        await markBindingInconclusive(binding, 'remote_environment_packet_integrity')
        continue
      }
    }
    if (!evidenceEligible(binding.testRun)) {
      await terminalizeBinding(binding, outcomeFor(binding.testRun))
      continue
    }
    if (
      !managedCapsuleMatchesAssessmentBinding({
        run: binding.testRun,
        capsule: binding.testRun.runtimeCapsule,
        binding,
      })
    ) {
      await markBindingInconclusive(binding, 'managed_capsule_integrity')
      continue
    }
    const traceHashes = await Promise.all(binding.testRun.testCases.map(testCase => bytesHash(testCase.tracePath)))
    const [reportHash, logHash] = await Promise.all([
      bytesHash(binding.testRun.reportPath),
      bytesHash(binding.testRun.logPath),
    ])
    if (!reportHash || !logHash) {
      await markBindingInconclusive(binding)
      continue
    }
    const traceHash = traceHashes.length && traceHashes.every(Boolean) ? hash(traceHashes) : null
    const capsule = binding.testRun.runtimeCapsule
    const outcome = outcomeFor(binding.testRun)
    let environmentSnapshotHash: string
    try {
      environmentSnapshotHash = remoteEnvironmentSnapshotHash ?? sealedEnvironmentSnapshot(binding.testRun, false)
    } catch {
      // A bad frozen packet must never be converted into a receipt based on
      // the mutable Environment row. Preserve the terminal fact as
      // inconclusive so reconciliation remains resumable without sealing.
      await markBindingInconclusive(binding)
      continue
    }
    const browserSnapshotHash = hash({ browser: binding.testRun.browserEngine })
    const dataProvenanceHash = hash({
      targetProjectId: run.targetProjectId,
      assessmentId: run.assessmentId,
      assessmentRunId: run.id,
      subjectRevisionId: run.evaluationSubjectRevisionId,
      generationId: binding.generationId,
      generationKey: binding.generation.generationKey,
      publicationId: binding.publicationId,
      publicationOperationHash: binding.publicationOperationHash,
      publicationAuthority: binding.publication.preflightAuthority,
      runtimeInputHash: binding.runtimeInputHash,
      runtimeInput: binding.publication.runtimeInputJson,
      environmentSnapshotHash,
    })
    const outputHash = hash({
      capsuleHash: capsule?.capsuleHash ?? null,
      manifestHash: capsule?.manifestHash ?? null,
      reportHash,
      logHash,
      traceHash,
    })
    const receiptHash = hashEvidenceReceipt({
      targetProjectId: run.targetProjectId,
      assessmentId: run.assessmentId,
      assessmentRunId: run.id,
      validationVersionHash: binding.validationVersion.canonicalHash,
      generationId: binding.generationId,
      publicationId: binding.publicationId,
      publicationOperationHash: binding.publicationOperationHash,
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
        generationId: binding.generationId,
        publicationId: binding.publicationId,
        publicationOperationHash: binding.publicationOperationHash,
        publicationAuthority: binding.publication.preflightAuthority,
        evaluationSubjectRevisionId: run.evaluationSubjectRevisionId,
        resultMatrixCell: binding.resultMatrixCell,
        assuranceLevel: assuranceFor(binding.generation),
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
    await terminalizeBinding(binding, outcome, receipt.id)
  }
  const current = await executionClient.assessmentRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { bindings: { include: { testRun: { select: { status: true } } } } },
  })
  const allTerminal = current.bindings.length > 0 && current.bindings.every(terminalAndSealedBinding)
  const evidenceComplete = allTerminal && current.bindings.every(binding => binding.evidenceReceiptId)
  const blockedByHumanVerification = current.bindings.some(binding => binding.terminalOutcome === 'BLOCKED')
  if (allTerminal) {
    const status = current.stopReason ? 'STOPPED' : 'COMPLETED'
    await executionClient.assessmentRun.updateMany({
      where: { id: current.id, status: { in: ['PREPARED', 'RUNNING', 'STOP_REQUESTED'] } },
      data: { status },
    })
    if (current.assessmentId && evidenceComplete && !current.stopReason && !blockedByHumanVerification)
      await executionClient.assessment.updateMany({
        where: { id: current.assessmentId, status: 'RUNNING' },
        data: { status: 'EVIDENCE_REVIEW' },
      })
    // A terminal run with incomplete evidence (including an external human
    // verification boundary) cannot reopen its Assessment. Its one-use
    // consent is already consumed, so make the immutable predecessor
    // successor-eligible rather than returning it to READY for another run.
    if (current.assessmentId && (!evidenceComplete || blockedByHumanVerification) && !current.stopReason)
      await executionClient.assessment.updateMany({
        where: { id: current.assessmentId, status: 'RUNNING' },
        data: { status: 'CANCELLED' },
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
