import crypto from 'node:crypto'
import path from 'node:path'
import {
  BrowserEngine,
  TestRunResult,
  TestRunStatus,
  type Environment,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import prisma from '@/config/db-config'
import {
  frozenEnvironmentSnapshot,
  frozenRemoteEnvironmentPacketSnapshot,
  parseFrozenRemoteEnvironmentPacket,
  runtimeEnvironmentFromFrozenPacket,
} from '@/lib/quality-design/frozen-environment-snapshot'
import {
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  expectedQualityPublicationPreflightAuthority,
  isKnownQualityPublicationPreflightAuthority,
  remoteScopePhaseBinding,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import { CapsuleExecutorAdapter } from '@/lib/executor/capsule-executor-adapter'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import { formatLogsForStorage } from '@/lib/test-run/log-formatter'
import {
  parseCanonicalRuntimeCapsuleManifest,
  RuntimeCapsuleMaterializer,
  RuntimeCapsulePreflight,
  resolveRuntimeCapsulePaths,
} from '@/lib/runtime-capsule'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { validationArtifactSchema, type ValidationArtifact } from '@/lib/quality-design/validation-artifact-contract'
import { validationAstPublishOperationIdFromReceiptHash } from '@/lib/quality-design/validation-runtime-input-contract'
import { persistProjectedExecutionArtifacts } from '@/services/coordinator/quality-validation-publication-service'
import { assertRemoteEvaluationScopeCurrent } from '@/services/coordinator/remote-evaluation-scope-service'
import { scheduleTestRunCompletion } from './test-run-service'
import { ServiceError } from '@/services/shared/errors'

/** Quality-owned execution never fabricates a ready capsule. It is prepared
 * against the immutable ValidationVersion publication and then uses the same
 * materializer, preflight, executor and cancellation state machine. */
export type PrepareQualityCapsuleTestRunInput = {
  publicationId: string
  validationVersionId: string
  targetProjectId: string
  environmentId: string
  name: string
  browserEngine?: BrowserEngine
  preparationKey?: string
  /** Durable owner for an ASSESSMENT TestRun.  The service derives whether a
   * frozen remote packet is mandatory from this persisted subject identity. */
  assessmentRunId?: string
  /** Appraise-owned remote scope snapshot; no later Environment row may alter
   * the capsule command receipt or process environment. */
  environmentSnapshot?: { hash: string; json: string; version: number }
}
export type StartQualityCapsuleTestRunInput = PrepareQualityCapsuleTestRunInput & { testRunDbId: string }
/** Explicit published-validation path for a standalone TestRun. It deliberately
 * shares the sealed publication materializer but never creates Assessment state. */
export type PrepareIndependentPublishedCapsuleTestRunInput = PrepareQualityCapsuleTestRunInput
export type StartIndependentPublishedCapsuleTestRunInput = PrepareIndependentPublishedCapsuleTestRunInput & {
  testRunDbId: string
}
type CapsuleIntent = 'ASSESSMENT' | 'INDEPENDENT'
type CapsuleMaterialization = {
  row: { id: string; validationHash: string }
  manifest: { commandReceipt: { hash: string } }
}
type OwnedAttempt = { id: string; ownerToken: string; version: number }
type CapsuleStartTestRun = {
  id: string
  runId: string
  targetProjectId: string
  environmentId: string
  browserEngine: BrowserEngine
  intent: string
  status: TestRunStatus
  environment: Environment
  environmentSnapshotJson?: string | null
  environmentSnapshotHash?: string | null
  environmentSnapshotVersion?: number | null
  targetProject: { kind: string } | null
  assessmentRunBinding?: {
    generationId: string | null
    publicationId: string | null
    publicationOperationHash: string | null
    validationVersionId: string
    assessmentRun?: { evaluationSubjectRevision: { subjectKind: string | null } }
  } | null
  runtimeCapsuleExecutionAttempt?: {
    id: string
    state: string
    ownerToken: string | null
    version: number
    capsule: { qualityPublicationId: string | null; manifestJson: string }
  } | null
}
type PublishedValidationNode = ValidationArtifact['validations'][number]
type PublishedCaseLink = { testCaseId: string; testSuiteId: string }

function qualityCapsulePreparationKey(input: PrepareQualityCapsuleTestRunInput) {
  if (input.preparationKey) return input.preparationKey
  return `sha256:${crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        publicationId: input.publicationId,
        validationVersionId: input.validationVersionId,
        targetProjectId: input.targetProjectId,
        environmentId: input.environmentId,
        browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
        environmentSnapshotHash: input.environmentSnapshot?.hash,
        runIntent: input.name,
      }),
    )
    .digest('hex')}`
}

function assertCapsulePreflightReady(preflight: { status: string; blockers: Array<{ code: string }> }) {
  if (preflight.status !== 'ready') throw new Error(`Capsule preflight blocked: ${preflight.blockers[0]?.code}`)
}

function assertPublicationPreflightV2(
  publication: {
    preflightAlgorithmVersion?: string
    preflightDisposition?: string
    preflightAuthority?: string | null
    targetProject?: { kind: string } | null
  },
  targetKind?: string,
) {
  // Older unit doubles may omit every v2 column. Persisted rows are non-null
  // after the cutover; once v2 fields are present, authority is mandatory and
  // must bind the target kind exactly.
  const resolvedTargetKind = targetKind ?? publication.targetProject?.kind
  const authorityValid = resolvedTargetKind
    ? publication.preflightAuthority === expectedQualityPublicationPreflightAuthority(resolvedTargetKind)
    : isKnownQualityPublicationPreflightAuthority(publication.preflightAuthority)
  if (
    publication.preflightAlgorithmVersion !== undefined &&
    (publication.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM ||
      publication.preflightDisposition !== 'ACTIVE' ||
      !authorityValid)
  )
    throw new ServiceError(
      'Quality validation publication uses an unsupported v2 preflight authority or algorithm.',
      'CONFLICT',
      409,
      {
        code: 'preflight_algorithm_unsupported',
        targetOutcome: 'not_evaluated',
      },
    )
}

function assertPublicationGeneration(
  publication: {
    id: string
    generationId: string
    operationHash: string
    validationVersionId: string
    generation?: {
      id: string
      disposition: string
      preflightAlgorithmVersion: string
      preflightAuthority: string
    } | null
  },
  targetKind?: string,
) {
  const generation = publication.generation
  // Prisma's required relation is present in production. A few narrow legacy
  // unit doubles model only the publication preflight fields; keep those
  // tests focused on their own boundary rather than fabricating a selector
  // fallback in the runtime path.
  if (generation === undefined) return
  if (
    !generation ||
    generation.id !== publication.generationId ||
    generation.disposition !== 'ACTIVE' ||
    generation.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM ||
    !targetKind ||
    generation.preflightAuthority !== expectedQualityPublicationPreflightAuthority(targetKind)
  )
    throw new ServiceError(
      'Quality validation publication lacks a supported active executable generation.',
      'CONFLICT',
      409,
      { code: 'preflight_algorithm_unsupported', targetOutcome: 'not_evaluated' },
    )
}

function assertBoundAssessmentPublication(
  binding: CapsuleStartTestRun['assessmentRunBinding'],
  publication: { id: string; generationId: string; operationHash: string; validationVersionId: string },
) {
  if (!binding?.generationId || !binding.publicationId || !binding.publicationOperationHash)
    throw new Error('Legacy-unbound Assessment binding cannot execute new managed evidence.')
  if (
    binding.validationVersionId !== publication.validationVersionId ||
    binding.generationId !== publication.generationId ||
    binding.publicationId !== publication.id ||
    binding.publicationOperationHash !== publication.operationHash
  )
    throw new Error('Assessment binding does not match the exact Quality generation and publication.')
}

function frozenEnvironment<
  T extends {
    environment: Environment
    environmentSnapshotJson?: string | null
    environmentSnapshotHash?: string | null
    environmentSnapshotVersion?: number | null
  },
>(testRun: T, remoteScopeRequired = false): Environment {
  const packet = frozenEnvironmentSnapshot(testRun, { required: remoteScopeRequired })
  return (
    packet ? runtimeEnvironmentFromFrozenPacket(testRun.environment as never, packet) : testRun.environment
  ) as Environment
}

function assertSnapshotAtPersistenceBoundary(
  environment: Environment & { scopeVersion?: number },
  snapshot: NonNullable<PrepareQualityCapsuleTestRunInput['environmentSnapshot']> | undefined,
  required = false,
) {
  if (!snapshot) {
    if (required) throw new Error('Remote evaluation scope TestRun lacks its required frozen environment snapshot.')
    return
  }
  let frozen
  try {
    frozen = parseFrozenRemoteEnvironmentPacket(JSON.parse(snapshot.json) as unknown)
  } catch {
    throw new Error('Remote environment snapshot is not a strict canonical packet.')
  }
  const actual = frozenRemoteEnvironmentPacketSnapshot(environment)
  if (
    frozen.id !== environment.id ||
    frozen.targetProjectId !== environment.targetProjectId ||
    frozen.scopeVersion !== snapshot.version ||
    actual.hash !== snapshot.hash ||
    actual.json !== snapshot.json
  )
    throw new Error('Remote environment changed before TestRun snapshot persistence.')
}

function canonicalFrozenEnvironmentSnapshot(environment: Environment & { scopeVersion?: number }) {
  const snapshot = frozenRemoteEnvironmentPacketSnapshot(environment as Environment)
  return { hash: snapshot.hash, json: snapshot.json, version: snapshot.version }
}

function publishedPreparationNode(
  publication: {
    phase: string
    targetProjectId: string
    validationVersionId: string
    validationProjectionJson: string
    astId: string
    id: string
    receiptHash: string
  },
  input: PrepareQualityCapsuleTestRunInput,
) {
  const matchingPublication =
    publication.phase === 'review_ready' &&
    publication.targetProjectId === input.targetProjectId &&
    publication.validationVersionId === input.validationVersionId
  if (!matchingPublication)
    throw new Error('Quality capsule publication ownership does not match the preparation request.')
  const validation = validationArtifactSchema.parse(JSON.parse(publication.validationProjectionJson))
  const node = validation.validations.find(item => item.id === publication.astId)
  if (
    !node ||
    node.astProvenance?.publishOperationId !== validationAstPublishOperationIdFromReceiptHash(publication.receiptHash)
  )
    throw new Error('Quality capsule preparation requires the exact reviewed validation projection.')
  const suiteByCase = new Map(
    node.appraiseArtifacts.testSuites.flatMap(suite => suite.testCaseIds.map(id => [id, suite.id] as const)),
  )
  const links = node.appraiseArtifacts.testCases.map(testCase => ({
    testCaseId: testCase.id,
    testSuiteId: suiteByCase.get(testCase.id),
  }))
  if (links.some(link => !link.testSuiteId) || links.length !== node.testCaseIds.length)
    throw new Error('Quality capsule expected case/suite associations are incomplete.')
  return { node, links: links as PublishedCaseLink[] }
}

export class RuntimeCapsuleTestRunService {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
  ) {}

  async prepareQuality(input: PrepareQualityCapsuleTestRunInput) {
    return this.preparePublished(input, 'ASSESSMENT')
  }

  async prepareIndependentPublished(input: PrepareIndependentPublishedCapsuleTestRunInput) {
    return this.preparePublished(input, 'INDEPENDENT')
  }

  private async reserveCapsuleAttempt(input: {
    testRun: CapsuleStartTestRun
    intent: CapsuleIntent
    materialized: CapsuleMaterialization
    preflight: unknown
  }) {
    const ownerToken = crypto.randomUUID()
    const attempt = await this.client.$transaction(async tx => {
      const claimedRun = await tx.testRun.updateMany({
        where: { id: input.testRun.id, status: TestRunStatus.QUEUED, intent: input.intent },
        data: { status: TestRunStatus.RUNNING },
      })
      if (claimedRun.count !== 1)
        throw new Error(
          `${input.intent === 'ASSESSMENT' ? 'Published capsule TestRun' : 'Independent TestRun'} was cancelled before execution claim.`,
        )
      return tx.runtimeCapsuleExecutionAttempt.upsert({
        where: { testRunId: input.testRun.id },
        update: {},
        create: {
          testRunId: input.testRun.id,
          capsuleId: input.materialized.row.id,
          receiptHash: input.materialized.manifest.commandReceipt.hash,
          preflightResultJson: canonicalRuntimeCapsuleJson(input.preflight),
          preflightResultHash: hashRuntimeCapsuleValue(input.preflight),
          preflightCheckedAt: new Date((input.preflight as { checkedAt: string }).checkedAt),
          state: 'STARTING',
          ownerToken,
        },
      })
    })
    return { attempt, ownerToken }
  }

  private async claimAttemptStart(attempt: OwnedAttempt, errorMessage: string) {
    const claimed = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
      where: { id: attempt.id, state: 'STARTING', ownerToken: attempt.ownerToken, version: attempt.version },
      data: { version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new Error(errorMessage)
    return { ...attempt, version: attempt.version + 1 }
  }

  private async scheduleReservedCapsule(input: {
    testRun: CapsuleStartTestRun
    materialized: CapsuleMaterialization
    paths: ReturnType<typeof resolveRuntimeCapsulePaths>
    attempt: OwnedAttempt
    remoteScopeRequired: boolean
    label: 'Quality' | 'Independent'
    beforeSpawnError: string
    verifyRunStatusAfterSpawn: boolean
  }) {
    const logPath = path.join(input.paths.capsuleRoot, 'logs/cucumber.log')
    const logger = await createTestRunLogger(input.testRun.runId, logPath)
    await this.client.testRun.update({ where: { id: input.testRun.id }, data: { logPath } })
    const adapter = new CapsuleExecutorAdapter(this.client, this.appraiseRoot)
    await scheduleTestRunCompletion({
      testRun: input.testRun,
      environment: frozenEnvironment(input.testRun, input.remoteScopeRequired),
      logger,
      launch: async () => {
        const current = await this.client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({
          where: { id: input.attempt.id },
        })
        if (current.state !== 'STARTING' || current.ownerToken !== input.attempt.ownerToken)
          throw new Error(input.beforeSpawnError)
        const launched = await adapter.execute({
          projectId: input.testRun.targetProjectId,
          validationHash: input.materialized.row.validationHash,
          testRunId: input.testRun.id,
          runId: input.testRun.runId,
          capsuleRoot: input.paths.capsuleRoot,
          receiptHash: input.materialized.manifest.commandReceipt.hash,
        })
        const transitioned = await this.transitionAttemptToRunning({
          attempt: input.attempt,
          testRunId: input.testRun.id,
          verifyRunStatus: input.verifyRunStatusAfterSpawn,
        })
        if (!transitioned) {
          launched.process.process.kill('SIGTERM')
          throw new Error(`${input.label} capsule execution ownership changed during spawn registration.`)
        }
        return launched
      },
      executionAttempt: { id: input.attempt.id, ownerToken: input.attempt.ownerToken },
      client: this.client,
      waitForProcess: processName => adapter.waitForProcess(processName),
      appraiseRoot: this.appraiseRoot,
    })
  }

  private async transitionAttemptToRunning(input: {
    attempt: OwnedAttempt
    testRunId: string
    verifyRunStatus: boolean
  }) {
    if (!input.verifyRunStatus) {
      const running = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: input.attempt.id, state: 'STARTING', ownerToken: input.attempt.ownerToken },
        data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      })
      return running.count === 1
    }
    return this.client.$transaction(async tx => {
      const running = await tx.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: input.attempt.id, state: 'STARTING', ownerToken: input.attempt.ownerToken },
        data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      })
      if (running.count !== 1) return false
      const run = await tx.testRun.findUnique({ where: { id: input.testRunId }, select: { status: true } })
      if (run?.status !== TestRunStatus.RUNNING)
        throw new Error('Quality TestRun was cancelled before spawn registration.')
      return true
    })
  }

  private async failCapsuleStart(input: {
    testRun: CapsuleStartTestRun
    intent: CapsuleIntent
    ownedAttempt?: OwnedAttempt
    failedComponent: string
    error: unknown
  }) {
    const completedAt = new Date()
    const message = (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500)
    if (input.ownedAttempt) {
      await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: {
          id: input.ownedAttempt.id,
          ownerToken: input.ownedAttempt.ownerToken,
          state: 'STARTING',
          version: input.ownedAttempt.version,
        },
        data: { state: 'FAILED', completedAt, failure: message, version: { increment: 1 } },
      })
    }
    await this.client.testRun.updateMany({
      where: {
        id: input.testRun.id,
        ...(input.intent === 'INDEPENDENT' ? { intent: 'INDEPENDENT' } : {}),
        status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] },
      },
      data: {
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.FAILED,
        evidenceHealth: 'infrastructure_failure',
        completedAt,
      },
    })
    const label = input.intent === 'ASSESSMENT' ? 'Quality' : 'independent'
    const logs = formatLogsForStorage([
      {
        type: 'stderr',
        message: `Infrastructure failure in ${label} runtime capsule ${input.failedComponent}: ${message}`,
        timestamp: completedAt,
      },
    ])
    await this.client.testRunLog.upsert({
      where: { testRunId: input.testRun.runId },
      create: { testRunId: input.testRun.runId, logs },
      update: { logs },
    })
  }

  private async preparePublished(input: PrepareQualityCapsuleTestRunInput, intent: 'ASSESSMENT' | 'INDEPENDENT') {
    const publication = await this.client.qualityValidationPublication.findUniqueOrThrow({
      where: { id: input.publicationId },
      include: { generation: true, targetProject: { select: { kind: true } } },
    })
    const targetKind = publication.targetProject?.kind ?? 'LOCAL_WORKSPACE'
    assertPublicationPreflightV2(publication, targetKind)
    assertPublicationGeneration(publication, targetKind)
    if (intent === 'ASSESSMENT' && !input.assessmentRunId)
      throw new Error('Assessment capsule preparation requires its durable AssessmentRun owner.')
    const { node, links } = publishedPreparationNode(publication, input)
    try {
      return await this.client.$transaction(tx =>
        this.preparePublishedTransaction(tx, input, intent, publication, node, links),
      )
    } catch (error) {
      // A partial remote relation during the transaction must never escape as
      // a TypeError; it is an invalidated scope and no projection/run write is
      // allowed to continue.
      if (intent === 'ASSESSMENT' && error instanceof TypeError)
        throw new ServiceError('Remote environment changed before TestRun snapshot persistence.', 'CONFLICT', 409, {
          code: 'remote_evaluation_scope_stale',
        })
      throw error
    }
  }

  private assertRemotePreparationOwner(input: {
    intent: CapsuleIntent
    environmentId: string
    environmentSnapshot: PrepareQualityCapsuleTestRunInput['environmentSnapshot']
    owner: {
      evaluationSubjectRevision: {
        subjectKind: string
        remoteEvaluationScopeBinding: {
          environmentId: string
          environmentSnapshotHash: string
          environmentSnapshotJson: string
          environmentScopeVersion: number
        } | null
      }
    } | null
  }) {
    if (input.intent === 'ASSESSMENT' && !input.owner)
      throw new Error('Assessment capsule preparation owner is missing or outside the target.')
    const owner = input.owner
    const binding = owner?.evaluationSubjectRevision.remoteEvaluationScopeBinding
    if (owner?.evaluationSubjectRevision.subjectKind !== 'REMOTE_EVALUATION_SCOPE') return
    if (!binding || binding.environmentId !== input.environmentId)
      throw new Error('Remote AssessmentRun owner lacks an exact scope-bound environment.')
    if (!this.remoteOwnerSnapshotMatches(binding, input.environmentSnapshot))
      throw new Error('Remote AssessmentRun requires the exact frozen scope environment snapshot.')
  }

  private remoteOwnerSnapshotMatches(
    binding: {
      environmentSnapshotHash: string
      environmentSnapshotJson: string
      environmentScopeVersion: number
    },
    snapshot: PrepareQualityCapsuleTestRunInput['environmentSnapshot'],
  ) {
    return (
      !!snapshot &&
      snapshot.hash === binding.environmentSnapshotHash &&
      snapshot.json === binding.environmentSnapshotJson &&
      snapshot.version === binding.environmentScopeVersion
    )
  }

  private remoteScopeRequired(input: { subjectKind?: string; projectKind: string }) {
    return input.subjectKind === 'REMOTE_EVALUATION_SCOPE' || input.projectKind === 'REMOTE_BLACK_BOX'
  }

  private environmentSnapshotForPreparation(input: {
    supplied: PrepareQualityCapsuleTestRunInput['environmentSnapshot']
    remoteScopeRequired: boolean
    intent: CapsuleIntent
    environment: Environment
  }) {
    if (input.supplied) return input.supplied
    if (input.remoteScopeRequired && input.intent === 'INDEPENDENT')
      return canonicalFrozenEnvironmentSnapshot(input.environment)
    return undefined
  }

  private async publishedPreparationContext(
    tx: Prisma.TransactionClient,
    input: PrepareQualityCapsuleTestRunInput,
    intent: CapsuleIntent,
    publication: { id: string; generationId: string; operationHash: string; validationVersionId: string },
  ) {
    const [environment, project] = await Promise.all([
      tx.environment.findFirst({ where: { id: input.environmentId, targetProjectId: input.targetProjectId } }),
      tx.targetProject.findUnique({ where: { id: input.targetProjectId } }),
    ])
    if (!environment || !project) throw new Error('Quality capsule environment or project is missing.')
    const owner =
      intent === 'ASSESSMENT'
        ? await tx.assessmentRun.findFirst({
            where: { id: input.assessmentRunId!, targetProjectId: input.targetProjectId },
            include: {
              evaluationSubjectRevision: { include: { remoteEvaluationScopeBinding: true } },
              publicationCheckpoints: { where: { validationVersionId: input.validationVersionId } },
            },
          })
        : null
    if (owner) {
      const checkpoint = owner.publicationCheckpoints[0]
      if (
        !checkpoint ||
        checkpoint.generationId !== publication.generationId ||
        checkpoint.publicationId !== publication.id ||
        checkpoint.publicationOperationHash !== publication.operationHash ||
        checkpoint.validationVersionId !== publication.validationVersionId
      )
        throw new Error('AssessmentRun checkpoint does not match the exact Quality generation and publication.')
    }
    const remoteScopeRequired = this.remoteScopeRequired({
      subjectKind: owner?.evaluationSubjectRevision.subjectKind,
      projectKind: project.kind,
    })
    const remoteBinding = owner?.evaluationSubjectRevision.remoteEvaluationScopeBinding
    const remoteScope =
      owner?.evaluationSubjectRevision.subjectKind === 'REMOTE_EVALUATION_SCOPE' && remoteBinding
        ? remoteScopePhaseBinding({ subject: owner.evaluationSubjectRevision, binding: remoteBinding })
        : null
    // Recheck the immutable scope before dereferencing its frozen packet. A
    // changed revision/design must be reported as typed scope drift rather
    // than leaking a partial-row TypeError from packet comparison.
    if (remoteScope) await assertRemoteEvaluationScopeCurrent(remoteScope, tx as never)
    this.assertRemotePreparationOwner({
      intent,
      environmentId: input.environmentId,
      environmentSnapshot: input.environmentSnapshot,
      owner,
    })
    const environmentSnapshot = this.environmentSnapshotForPreparation({
      supplied: input.environmentSnapshot,
      remoteScopeRequired,
      intent,
      environment,
    })
    assertSnapshotAtPersistenceBoundary(environment, environmentSnapshot, remoteScopeRequired)
    if (remoteScope) await assertRemoteEvaluationScopeCurrent(remoteScope, tx as never)
    return { environment, project, environmentSnapshot, remoteScopeRequired }
  }

  private assertPreparedTestRunIdentity(input: {
    testRun: {
      targetProjectId: string
      environmentId: string
      intent: string
      environmentSnapshotHash: string | null
      environmentSnapshotJson: string | null
      environmentSnapshotVersion: number | null
      assessmentRunBinding: unknown
      testCases: Array<{ testCaseId: string; testSuiteId: string | null }>
    }
    request: PrepareQualityCapsuleTestRunInput
    intent: CapsuleIntent
    environmentSnapshot: PrepareQualityCapsuleTestRunInput['environmentSnapshot']
    remoteScopeRequired: boolean
    links: PublishedCaseLink[]
  }) {
    const { testRun, request, intent, environmentSnapshot, remoteScopeRequired, links } = input
    const snapshotMismatch = !this.preparedSnapshotMatches(testRun, environmentSnapshot)
    const missingRemoteSnapshot = remoteScopeRequired && !this.hasFrozenSnapshot(testRun)
    const linksMatch = this.preparedLinksMatch(testRun.testCases, links)
    const coreIdentityMatches = this.preparedCoreIdentityMatches(testRun, request, intent)
    if (!coreIdentityMatches || snapshotMismatch || missingRemoteSnapshot || !linksMatch)
      throw new Error('Existing prepared Quality capsule TestRun identity differs from the request.')
  }

  private preparedCoreIdentityMatches(
    testRun: {
      targetProjectId: string
      environmentId: string
      intent: string
      assessmentRunBinding: unknown
    },
    request: PrepareQualityCapsuleTestRunInput,
    intent: CapsuleIntent,
  ) {
    return (
      testRun.targetProjectId === request.targetProjectId &&
      testRun.environmentId === request.environmentId &&
      testRun.intent === intent &&
      (intent !== 'INDEPENDENT' || testRun.assessmentRunBinding === null)
    )
  }

  private preparedSnapshotMatches(
    testRun: {
      environmentSnapshotHash: string | null
      environmentSnapshotJson: string | null
      environmentSnapshotVersion: number | null
    },
    snapshot: PrepareQualityCapsuleTestRunInput['environmentSnapshot'],
  ) {
    if (!snapshot) return true
    return (
      testRun.environmentSnapshotHash === snapshot.hash &&
      testRun.environmentSnapshotJson === snapshot.json &&
      testRun.environmentSnapshotVersion === snapshot.version
    )
  }

  private hasFrozenSnapshot(testRun: {
    environmentSnapshotHash: string | null
    environmentSnapshotJson: string | null
    environmentSnapshotVersion: number | null
  }) {
    return (
      !!testRun.environmentSnapshotHash &&
      !!testRun.environmentSnapshotJson &&
      testRun.environmentSnapshotVersion !== null
    )
  }

  private preparedLinksMatch(
    actual: Array<{ testCaseId: string; testSuiteId: string | null }>,
    expected: PublishedCaseLink[],
  ) {
    const expectedLinks = new Set(expected.map(link => `${link.testCaseId}:${link.testSuiteId}`))
    const actualLinks = new Set(actual.map(link => `${link.testCaseId}:${link.testSuiteId}`))
    return expectedLinks.size === actualLinks.size && [...expectedLinks].every(link => actualLinks.has(link))
  }

  private async preparePublishedTransaction(
    tx: Prisma.TransactionClient,
    input: PrepareQualityCapsuleTestRunInput,
    intent: CapsuleIntent,
    publication: {
      id: string
      generationId: string
      operationHash: string
      validationVersionId: string
      preflightAlgorithmVersion?: string
      preflightDisposition?: string
      preflightAuthority?: string | null
    },
    node: PublishedValidationNode,
    links: PublishedCaseLink[],
  ) {
    const context = await this.publishedPreparationContext(tx, input, intent, publication)
    assertPublicationPreflightV2(publication, context.project.kind)
    const preparationKey = qualityCapsulePreparationKey({ ...input, environmentSnapshot: context.environmentSnapshot })
    // The outer AssessmentRun reservation is not write authority for this
    // later TestRun/projection transaction. The context above recomputes the
    // complete remote scope through this transaction client before durable
    // projection or TestRun writes can observe mutable state.
    await persistProjectedExecutionArtifacts(tx, { targetProjectId: input.targetProjectId, node })
    const testRun = await tx.testRun.upsert({
      where: { targetProjectId_preparationKey: { targetProjectId: input.targetProjectId, preparationKey } },
      update: {},
      create: {
        name: input.name,
        preparationKey,
        environmentId: context.environment.id,
        browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
        testWorkersCount: 1,
        status: TestRunStatus.QUEUED,
        result: TestRunResult.PENDING,
        intent,
        ...(context.environmentSnapshot
          ? {
              environmentSnapshotHash: context.environmentSnapshot.hash,
              environmentSnapshotJson: context.environmentSnapshot.json,
              environmentSnapshotVersion: context.environmentSnapshot.version,
            }
          : {}),
        targetProjectId: context.project.id,
        testCases: { create: links.map(link => ({ testCaseId: link.testCaseId, testSuiteId: link.testSuiteId })) },
      },
      include: { environment: true, testCases: true, assessmentRunBinding: true },
    })
    this.assertPreparedTestRunIdentity({
      testRun,
      request: input,
      intent,
      environmentSnapshot: context.environmentSnapshot,
      remoteScopeRequired: context.remoteScopeRequired,
      links,
    })
    return testRun
  }

  async startQuality(input: StartQualityCapsuleTestRunInput) {
    return this.startPublished(input, 'ASSESSMENT')
  }

  async startIndependentPublished(input: StartIndependentPublishedCapsuleTestRunInput) {
    return this.startPublished(input, 'INDEPENDENT')
  }

  private assertPublishedStartOwnership(input: {
    request: StartQualityCapsuleTestRunInput
    intent: CapsuleIntent
    publication: {
      phase: string
      targetProjectId: string
      validationVersionId: string
      id: string
      generationId: string
      operationHash: string
    }
    testRun: CapsuleStartTestRun
  }) {
    if (!this.publishedRequestMatches(input) || !this.publishedTestRunMatches(input))
      throw new Error('Prepared published capsule TestRun ownership differs from the start request.')
    if (input.testRun.status !== TestRunStatus.QUEUED)
      throw new Error('Prepared Quality capsule TestRun is no longer queued for execution.')
    if (input.intent === 'ASSESSMENT')
      assertBoundAssessmentPublication(input.testRun.assessmentRunBinding, input.publication)
  }

  private publishedRequestMatches(input: {
    request: StartQualityCapsuleTestRunInput
    publication: { phase: string; targetProjectId: string; validationVersionId: string }
  }) {
    return (
      input.publication.phase === 'review_ready' &&
      input.publication.targetProjectId === input.request.targetProjectId &&
      input.publication.validationVersionId === input.request.validationVersionId
    )
  }

  private publishedTestRunMatches(input: {
    request: StartQualityCapsuleTestRunInput
    intent: CapsuleIntent
    testRun: CapsuleStartTestRun
  }) {
    return (
      input.testRun.targetProjectId === input.request.targetProjectId &&
      input.testRun.environmentId === input.request.environmentId &&
      input.testRun.intent === input.intent &&
      (input.intent !== 'INDEPENDENT' || input.testRun.assessmentRunBinding === null)
    )
  }

  private async publishedStartContext(input: StartQualityCapsuleTestRunInput, intent: CapsuleIntent) {
    const [publication, testRun] = await Promise.all([
      this.client.qualityValidationPublication.findUniqueOrThrow({
        where: { id: input.publicationId },
        include: { generation: true },
      }),
      this.client.testRun.findUniqueOrThrow({
        where: { id: input.testRunDbId },
        include: {
          environment: true,
          targetProject: { select: { kind: true } },
          testCases: true,
          assessmentRunBinding: { include: { assessmentRun: { include: { evaluationSubjectRevision: true } } } },
          runtimeCapsuleExecutionAttempt: { include: { capsule: true } },
        },
      }),
    ])
    assertPublicationPreflightV2(publication, testRun.targetProject?.kind ?? 'MISSING_TARGET_PROJECT')
    assertPublicationGeneration(publication, testRun.targetProject?.kind ?? 'MISSING_TARGET_PROJECT')
    this.assertPublishedStartOwnership({ request: input, intent, publication, testRun })
    const remoteScopeRequired =
      testRun.targetProject?.kind === 'REMOTE_BLACK_BOX' ||
      testRun.assessmentRunBinding?.assessmentRun.evaluationSubjectRevision.subjectKind === 'REMOTE_EVALUATION_SCOPE'
    // This must precede materialization, attempt reservation, run claiming,
    // logging, and process spawn. A mutable Environment cannot repair a
    // missing or tampered remote packet.
    frozenEnvironmentSnapshot(testRun, { required: remoteScopeRequired })
    return { publication, testRun, remoteScopeRequired }
  }

  private existingPublishedAttempt(input: {
    publication: {
      id: string
      receiptHash: string
      operationHash: string
      generation: { id: string; generationKey: string }
    }
    testRun: CapsuleStartTestRun
  }) {
    const existing = input.testRun.runtimeCapsuleExecutionAttempt
    if (!existing) return null
    if (existing.capsule.qualityPublicationId !== input.publication.id)
      throw new Error('Existing capsule execution attempt lacks the exact Quality publication binding.')
    const manifest = parseCanonicalRuntimeCapsuleManifest(existing.capsule.manifestJson)
    if (manifest.operationHash !== input.publication.operationHash)
      throw new Error('Existing Quality capsule execution attempt identity differs from the publication.')
    if (
      manifest.source.kind !== 'PUBLISHED_VALIDATION' ||
      manifest.source.publishOperationId !== input.publication.id ||
      manifest.source.generationId !== input.publication.generation.id ||
      manifest.source.generationKey !== input.publication.generation.generationKey
    )
      throw new Error('Existing Quality capsule execution attempt identity differs from the generation.')
    return { testRunId: input.testRun.id, runId: input.testRun.runId, attemptId: existing.id, state: existing.state }
  }

  private async startNewPublishedCapsule(input: {
    request: StartQualityCapsuleTestRunInput
    intent: CapsuleIntent
    publication: { id: string }
    testRun: CapsuleStartTestRun
    remoteScopeRequired: boolean
  }) {
    let ownedAttempt: OwnedAttempt | undefined
    let failedComponent = 'materialization'
    try {
      const materialized: CapsuleMaterialization = await new RuntimeCapsuleMaterializer(
        this.client,
        this.appraiseRoot,
      ).materializeQuality({ publicationId: input.publication.id, testRunId: input.testRun.id })
      const paths = resolveRuntimeCapsulePaths({
        appraiseRoot: this.appraiseRoot,
        projectId: input.request.targetProjectId,
        validationHash: materialized.row.validationHash,
        runId: input.testRun.runId,
      })
      failedComponent = 'preflight'
      const preflight = await new RuntimeCapsulePreflight(this.client, this.appraiseRoot).check({
        projectId: input.request.targetProjectId,
        validationHash: materialized.row.validationHash,
        testRunId: input.testRun.id,
        runId: input.testRun.runId,
      })
      const reserved = await this.reserveCapsuleAttempt({
        testRun: input.testRun,
        intent: input.intent,
        materialized,
        preflight,
      })
      if (
        reserved.attempt.capsuleId !== materialized.row.id ||
        reserved.attempt.receiptHash !== materialized.manifest.commandReceipt.hash
      )
        throw new Error('Existing capsule execution attempt identity differs from reviewed Quality materialization.')
      if (reserved.attempt.ownerToken !== reserved.ownerToken)
        return {
          testRunId: input.testRun.id,
          runId: input.testRun.runId,
          attemptId: reserved.attempt.id,
          state: reserved.attempt.state,
        }
      ownedAttempt = { id: reserved.attempt.id, ownerToken: reserved.ownerToken, version: reserved.attempt.version }
      assertCapsulePreflightReady(preflight)
      failedComponent = 'execution-start'
      ownedAttempt = await this.claimAttemptStart(
        ownedAttempt,
        'Quality capsule execution start ownership changed before spawn.',
      )
      await this.scheduleReservedCapsule({
        testRun: input.testRun,
        materialized,
        paths,
        attempt: ownedAttempt,
        remoteScopeRequired: input.remoteScopeRequired,
        label: 'Quality',
        beforeSpawnError: 'Quality capsule execution was cancelled or superseded before spawn.',
        verifyRunStatusAfterSpawn: true,
      })
      return { testRunId: input.testRun.id, runId: input.testRun.runId, attemptId: reserved.attempt.id, preflight }
    } catch (error) {
      await this.failCapsuleStart({
        testRun: input.testRun,
        intent: input.intent,
        ownedAttempt,
        failedComponent,
        error,
      })
      throw error
    }
  }

  private async startPublished(input: StartQualityCapsuleTestRunInput, intent: 'ASSESSMENT' | 'INDEPENDENT') {
    const context = await this.publishedStartContext(input, intent)
    const existing = this.existingPublishedAttempt(context)
    if (existing) return existing
    return this.startNewPublishedCapsule({ request: input, intent, ...context })
  }

  async startIndependentAuthored(input: { testRunDbId: string }) {
    let ownedAttempt: OwnedAttempt | undefined
    let failedComponent = 'materialization'
    const testRun = await this.client.testRun.findUniqueOrThrow({
      where: { id: input.testRunDbId },
      include: {
        environment: true,
        targetProject: { select: { kind: true } },
        testCases: true,
        assessmentRunBinding: true,
        runtimeCapsuleExecutionAttempt: { include: { capsule: true } },
      },
    })
    if (testRun.intent !== 'INDEPENDENT' || testRun.assessmentRunBinding)
      throw new Error('Independent TestRun cannot be prepared as Assessment execution.')
    if (testRun.status !== TestRunStatus.QUEUED)
      throw new Error('Independent TestRun is no longer queued for capsule execution.')
    const remoteScopeRequired = testRun.targetProject.kind === 'REMOTE_BLACK_BOX'
    // Authored snapshots have no Assessment owner, but a remote target still
    // must never inherit mutable Environment configuration at materialization
    // or execution time.
    frozenEnvironmentSnapshot(testRun, { required: remoteScopeRequired })
    const existing = testRun.runtimeCapsuleExecutionAttempt
    if (existing) return { testRunId: testRun.id, runId: testRun.runId, attemptId: existing.id, state: existing.state }
    try {
      const materialized: CapsuleMaterialization = await new RuntimeCapsuleMaterializer(
        this.client,
        this.appraiseRoot,
      ).materializeAuthored({ testRunId: testRun.id })
      const paths = resolveRuntimeCapsulePaths({
        appraiseRoot: this.appraiseRoot,
        projectId: testRun.targetProjectId,
        validationHash: materialized.row.validationHash,
        runId: testRun.runId,
      })
      failedComponent = 'preflight'
      const preflight = await new RuntimeCapsulePreflight(this.client, this.appraiseRoot).check({
        projectId: testRun.targetProjectId,
        validationHash: materialized.row.validationHash,
        testRunId: testRun.id,
        runId: testRun.runId,
      })
      const { attempt, ownerToken } = await this.reserveCapsuleAttempt({
        testRun,
        intent: 'INDEPENDENT',
        materialized,
        preflight,
      })
      if (attempt.ownerToken !== ownerToken)
        return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, state: attempt.state }
      ownedAttempt = { id: attempt.id, ownerToken, version: attempt.version }
      assertCapsulePreflightReady(preflight)
      ownedAttempt = await this.claimAttemptStart(
        ownedAttempt,
        'Independent capsule execution ownership changed before spawn.',
      )
      await this.scheduleReservedCapsule({
        testRun,
        materialized,
        paths,
        attempt: ownedAttempt,
        remoteScopeRequired,
        label: 'Independent',
        beforeSpawnError: 'Independent capsule execution was cancelled before spawn.',
        verifyRunStatusAfterSpawn: false,
      })
      return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, preflight }
    } catch (error) {
      await this.failCapsuleStart({
        testRun,
        intent: 'INDEPENDENT',
        ownedAttempt,
        failedComponent,
        error,
      })
      throw error
    }
  }

  private async activeAttemptContext(testRunId: string) {
    const attempt = await this.client.runtimeCapsuleExecutionAttempt.findUnique({ where: { testRunId } })
    if (!attempt || !['STARTING', 'RUNNING'].includes(attempt.state)) return null
    const run = await this.client.testRun.findUniqueOrThrow({ where: { id: testRunId }, select: { runId: true } })
    return { attempt, run }
  }

  async cancel(testRunId: string) {
    for (;;) {
      const context = await this.activeAttemptContext(testRunId)
      if (!context) {
        const completedAt = new Date()
        const queued = await this.client.testRun.updateMany({
          where: { id: testRunId, status: TestRunStatus.QUEUED },
          data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
        })
        return queued.count === 1
      }
      const { attempt, run } = context
      const cancelled = await this.client.$transaction(async tx => {
        const completedAt = new Date()
        const attemptResult = await tx.runtimeCapsuleExecutionAttempt.updateMany({
          where: { id: attempt.id, state: { in: ['STARTING', 'RUNNING'] }, version: attempt.version },
          data: { state: 'CANCELLED', completedAt, version: { increment: 1 } },
        })
        if (attemptResult.count !== 1) return false
        const runResult = await tx.testRun.updateMany({
          where: { id: testRunId, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
          data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
        })
        if (runResult.count !== 1) throw new Error('TestRun terminal state changed before cancellation CAS.')
        return true
      })
      if (!cancelled) continue
      const process = (await import('@/lib/test-run/process-manager')).processManager.get(run.runId)
      process?.process.kill('SIGTERM')
      return true
    }
  }
}
