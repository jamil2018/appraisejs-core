import { createHash, randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  QualityJourney,
  QualityJourneyCommand,
  QualityJourneyWorkAttempt,
  QualityJourneyWorkItem,
} from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  AgentFactoryDispatchNotStartedError,
  createQualityJourneyKernelState,
  createReplacementAssignment,
  createWorkerSpawnRequest,
  dispatchWorkerSpawnRequest,
  hashQualityJourneyState,
  journeyCommandResultSchema,
  journeyCommandSchema,
  qualityJourneyCapabilityProfiles,
  qualityJourneyContractDigest,
  qualityJourneyRoleDefinitions,
  qualityJourneyRoleRegistryVersion,
  qualityJourneyWorkItemId,
  runnableQualityJourneyRoles,
  reconstructQualityJourneyRunner,
  resolveQualityJourneyRoleDefinition,
  resolveAgentFactoryProviderAdapter,
  submitQualityJourneyCommand,
  validateWorkerResult,
  validateWorkerSpawnReceipt,
  workerResultEnvelopeSchema,
  type AssignmentManifest,
  type QualityJourneyKernelState,
  type QualityJourneyRole,
  type QualityJourneyStage,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient
const json = (value: unknown) => canonicalContractJson(value)
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
const parseArray = (value: string): string[] => JSON.parse(value) as string[]
const parseRecord = (value: string): Record<string, string> => JSON.parse(value) as Record<string, string>

type FactoryAuthorization = Pick<
  AssignmentManifest,
  | 'schemaVersion'
  | 'journeyId'
  | 'targetProjectId'
  | 'workItemId'
  | 'roleDefinition'
  | 'capabilityProfile'
  | 'inputArtifacts'
  | 'allowedTargetRoutes'
  | 'allowedResourceIds'
  | 'writableArtifactKinds'
  | 'scope'
  | 'completionCriteria'
> & { authorizationId: string }

function roleAuthority(role: QualityJourneyRole, version: string = qualityJourneyRoleRegistryVersion) {
  const roleDefinition = resolveQualityJourneyRoleDefinition(version, role)
  if (!roleDefinition) throw new ServiceError('Quality Journey role authority is unavailable.', 'CONFLICT')
  const capabilityProfile = Object.values(qualityJourneyCapabilityProfiles).find(
    profile => profile.profileId === roleDefinition.capabilityProfileId,
  )
  if (!capabilityProfile) throw new ServiceError('Quality Journey capability profile is unavailable.', 'CONFLICT')
  return { roleDefinition, capabilityProfile }
}

function factoryAuthorization(
  authorizationId: string,
  journey: Pick<QualityJourney, 'id' | 'targetProjectId'>,
  item: Pick<
    QualityJourneyWorkItem,
    'id' | 'role' | 'inputArtifactRefsJson' | 'allowedOutputsJson' | 'completionCriteriaJson'
  >,
  registryVersion: string = qualityJourneyRoleRegistryVersion,
): FactoryAuthorization {
  const { roleDefinition, capabilityProfile } = roleAuthority(item.role as QualityJourneyRole, registryVersion)
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    authorizationId,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    workItemId: item.id,
    roleDefinition: {
      role: roleDefinition.role,
      version: registryVersion,
      digest: qualityJourneyContractDigest(roleDefinition),
    },
    capabilityProfile: {
      profileId: capabilityProfile.profileId,
      version: registryVersion,
      digest: qualityJourneyContractDigest(capabilityProfile),
    },
    inputArtifacts: JSON.parse(item.inputArtifactRefsJson),
    allowedTargetRoutes: [],
    allowedResourceIds: [],
    writableArtifactKinds: JSON.parse(item.allowedOutputsJson),
    scope: {
      permittedTools: [...roleDefinition.permittedTools],
      permittedCommands: [...roleDefinition.permittedCommands],
      filesystemPaths: [],
      networkOrigins: [],
      credentialGrantIds: [],
      targetAccess: item.role === 'SCOUT' ? 'READ_ONLY' : 'NONE',
    },
    completionCriteria: JSON.parse(item.completionCriteriaJson),
  }
}

function validateFactoryAuthorization(
  authorization: {
    id: string
    journeyId: string
    targetProjectId: string
    workItemId: string
    role: QualityJourneyRole
    roleContractDigest: string
    capabilityProfileId: string
    capabilityProfileHash: string
    authorizationJson: string
    authorizationHash: string
  },
  journey: Pick<QualityJourney, 'id' | 'targetProjectId'>,
  item: QualityJourneyWorkItem,
): FactoryAuthorization {
  const persisted = JSON.parse(authorization.authorizationJson) as FactoryAuthorization
  const canonical = factoryAuthorization(authorization.id, journey, item, persisted.roleDefinition.version)
  const bindings = [
    [authorization.authorizationHash, hash(persisted)],
    [json(persisted), json(canonical)],
    [authorization.journeyId, journey.id],
    [authorization.targetProjectId, journey.targetProjectId],
    [authorization.workItemId, item.id],
    [authorization.role, item.role],
    [authorization.roleContractDigest, canonical.roleDefinition.digest],
    [persisted.roleDefinition.digest, canonical.roleDefinition.digest],
    [persisted.roleDefinition.version, canonical.roleDefinition.version],
    [authorization.capabilityProfileId, canonical.capabilityProfile.profileId],
    [authorization.capabilityProfileHash, canonical.capabilityProfile.digest],
    [persisted.capabilityProfile.version, canonical.capabilityProfile.version],
  ]
  if (bindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality Journey work authorization is invalid.', 'UNAUTHORIZED')
  return canonical
}

function assignmentFromAuthorization(
  authorization: FactoryAuthorization,
  item: QualityJourneyWorkItem,
  attempt: { id: string; leaseId: string; leaseExpiresAt: Date; heartbeatSeconds: number },
  inputArtifacts = authorization.inputArtifacts,
): AssignmentManifest {
  return {
    schemaVersion: authorization.schemaVersion,
    journeyId: authorization.journeyId,
    targetProjectId: authorization.targetProjectId,
    workItemId: authorization.workItemId,
    roleDefinition: authorization.roleDefinition,
    capabilityProfile: authorization.capabilityProfile,
    inputArtifacts,
    allowedTargetRoutes: authorization.allowedTargetRoutes,
    allowedResourceIds: authorization.allowedResourceIds,
    writableArtifactKinds: authorization.writableArtifactKinds,
    scope: authorization.scope,
    completionCriteria: authorization.completionCriteria,
    assignmentId: `qjma_${attempt.id}`,
    stateHash: item.inputHash,
    inputHash: item.inputHash,
    lease: {
      leaseId: attempt.leaseId,
      expiresAt: attempt.leaseExpiresAt.toISOString(),
      heartbeatSeconds: attempt.heartbeatSeconds,
    },
    idempotencyKey: `assignment_${attempt.id}`,
  }
}

function projection(row: QualityJourney) {
  const activeRevisionIds = parseRecord(row.activeRevisionIdsJson)
  const analysisReviewHash = row.analysisReviewHash ?? undefined
  const unresolvedQuestionIds = parseArray(row.unresolvedQuestionIdsJson)
  const blockerIds = parseArray(row.blockerIdsJson)
  const activeWorkItemIds = parseArray(row.activeWorkItemIdsJson)
  const permittedCommands = createQualityJourneyKernelState({
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    activeCycleId: row.activeCycleId,
    stage: row.stage as QualityJourneyStage,
    activeRevisionIds,
    analysisReviewHash,
    unresolvedQuestionIds,
    blockerIds,
    activeWorkItemIds,
  }).permittedCommands
  return {
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    stage: row.stage as QualityJourneyStage,
    status: row.status,
    activeCycleId: row.activeCycleId,
    activeRevisionIds,
    analysisReviewHash,
    unresolvedQuestionIds,
    blockerIds,
    activeWorkItemIds,
    permittedCommands,
    stateHash: row.stateHash,
    version: row.version,
  }
}

async function readJourney(journeyId: string, targetProjectId: string, db: Db) {
  const row = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!row) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  return row
}

async function createWorkAuthorization(
  row: QualityJourney,
  item: QualityJourneyWorkItem,
  db: Db,
  maxAttempts = 3,
  supersedesAuthorizationId?: string,
) {
  const authorizationId = `qjwa_${createHash('sha256')
    .update(`${row.id}:${item.id}:${supersedesAuthorizationId ?? 'initial'}`)
    .digest('hex')
    .slice(0, 24)}`
  const authorization = factoryAuthorization(authorizationId, row, item)
  await db.qualityJourneyWorkAuthorization.create({
    data: {
      id: authorizationId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      workItemId: item.id,
      ...(supersedesAuthorizationId ? { supersedesAuthorizationId } : {}),
      role: item.role,
      roleContractDigest: item.roleContractDigest,
      capabilityProfileId: authorization.capabilityProfile.profileId,
      capabilityProfileHash: authorization.capabilityProfile.digest,
      authorizationJson: json(authorization),
      authorizationHash: hash(authorization),
      maxAttempts,
    },
  })
}

async function currentWorkAuthorization(workItemId: string, db: Db) {
  return db.qualityJourneyWorkAuthorization.findFirst({
    where: { workItemId, successorAuthorization: { is: null } },
  })
}

/** A revision request is a new, transcript-free Analyzer authorization. Its
 * input is derived only from immutable predecessor artifacts, not coordinator
 * memory or a prior worker's transcript. */
async function predecessorAnalysisInputArtifacts(
  row: QualityJourney,
  db: Db,
): Promise<AssignmentManifest['inputArtifacts']> {
  const predecessorRevisionId = parseRecord(row.activeRevisionIdsJson).analysis
  if (!predecessorRevisionId)
    throw new ServiceError(
      'Analysis revision work cannot be reissued without an active predecessor charter.',
      'CONFLICT',
    )
  const predecessor = await db.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId: row.id, artifactRevisionId: predecessorRevisionId },
    include: {
      artifact: true,
      questions: { include: { artifact: true, answers: { include: { artifact: true } } } },
    },
  })
  if (!predecessor)
    throw new ServiceError('Analysis revision work cannot be reissued without durable predecessor lineage.', 'CONFLICT')
  const feedback = await db.qualityJourneyArtifact.findFirst({
    where: {
      journeyId: row.id,
      kind: 'ANALYSIS_REVISION_FEEDBACK',
      revisionId: predecessorRevisionId,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!feedback)
    throw new ServiceError('Analysis revision work cannot be reissued without durable user feedback.', 'CONFLICT')
  const artifacts = [
    predecessor.artifact,
    ...predecessor.questions.flatMap(question => [
      question.artifact,
      ...question.answers.map(answer => answer.artifact),
    ]),
    feedback,
  ]
  return artifacts
    .map(artifact => ({
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      ...(artifact.revisionId ? { revisionId: artifact.revisionId } : {}),
      contentHash: artifact.contentHash,
    }))
    .sort((left, right) =>
      canonicalContractJson(left).localeCompare(canonicalContractJson(right)),
    ) as AssignmentManifest['inputArtifacts']
}

async function ensureEligibleWorkItems(row: QualityJourney, db: Db) {
  const roles = runnableQualityJourneyRoles(row.stage as QualityJourneyStage, [])
  const activeWorkItemIds = parseArray(row.activeWorkItemIdsJson)
  for (const role of roles) {
    const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
    const id = qualityJourneyWorkItemId(row.id, row.activeCycleId, role)
    const existingItem = await db.qualityJourneyWorkItem.findUnique({ where: { id } })
    let item = existingItem
    if (
      item &&
      item.role === 'REQUIREMENT_ANALYZER' &&
      row.stage === 'ANALYSIS' &&
      item.status === 'COMPLETED' &&
      activeWorkItemIds.includes(item.id)
    ) {
      const inputArtifacts = await predecessorAnalysisInputArtifacts(row, db)
      const authorization = await currentWorkAuthorization(item.id, db)
      if (!authorization)
        throw new ServiceError(
          'Analysis revision work has no predecessor Factory authorization to supersede.',
          'CONFLICT',
        )
      item = await db.qualityJourneyWorkItem.update({
        where: { id: item.id },
        data: {
          status: 'ELIGIBLE',
          inputHash: row.stateHash,
          inputArtifactRefsJson: json(inputArtifacts),
          roleContractDigest: qualityJourneyContractDigest(definition),
          version: { increment: 1 },
        },
      })
      await createWorkAuthorization(row, item, db, 3, authorization.id)
    }
    if (!item) {
      item = await db.qualityJourneyWorkItem.create({
        data: {
          id,
          journeyId: row.id,
          targetProjectId: row.targetProjectId,
          cycleId: row.activeCycleId,
          role,
          status: 'ELIGIBLE',
          inputHash: row.stateHash,
          roleContractDigest: qualityJourneyContractDigest(definition),
          allowedOutputsJson: json(definition.writableArtifacts),
          completionCriteriaJson: json([`Submit a contract-valid ${role} result envelope.`]),
        },
      })
      await createWorkAuthorization(row, item, db)
    }
  }
}

async function recoverLegacyFactoryAuthorizations(row: QualityJourney, db: Db) {
  const items = await db.qualityJourneyWorkItem.findMany({
    where: {
      journeyId: row.id,
      authorizations: { none: {} },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] },
    },
  })
  for (const item of items) await createWorkAuthorization(row, item, db, 1)
  return items.map(item => item.id)
}

export async function createQualityJourney(
  input: { targetProjectId: string; idempotencyKey: string; requirement: unknown },
  client: PrismaClient = prisma,
) {
  const requestHash = hash(input)
  const existing = await client.qualityJourney.findUnique({
    where: {
      targetProjectId_rootIdempotencyKey: {
        targetProjectId: input.targetProjectId,
        rootIdempotencyKey: input.idempotencyKey,
      },
    },
  })
  if (existing) {
    if (existing.rootRequestHash !== requestHash)
      throw new ServiceError('Quality Journey idempotency key was reused with different input.', 'CONFLICT')
    return { replayed: true, journey: projection(existing) }
  }
  const journeyId = `qjy_${randomUUID()}`
  const cycleId = `qjc_${randomUUID()}`
  const revisionId = `qjr_${randomUUID()}`
  const revisionHash = hash(input.requirement)
  const initial = createQualityJourneyKernelState({
    journeyId,
    targetProjectId: input.targetProjectId,
    activeCycleId: cycleId,
    activeRevisionIds: { journey: revisionId },
  })
  const created = await client.$transaction(async tx => {
    const row = await tx.qualityJourney.create({
      data: {
        id: journeyId,
        targetProjectId: input.targetProjectId,
        rootIdempotencyKey: input.idempotencyKey,
        rootRequestHash: requestHash,
        activeCycleId: cycleId,
        activeRevisionIdsJson: json(initial.activeRevisionIds),
        stateHash: initial.stateHash,
      },
    })
    await tx.qualityJourneyRevision.create({
      data: { id: revisionId, journeyId, revision: 1, contentJson: json(input.requirement), contentHash: revisionHash },
    })
    await tx.qualityJourneyCycle.create({ data: { id: cycleId, journeyId, sequence: 1 } })
    await tx.qualityJourneyEvent.create({
      data: {
        id: `qje_${randomUUID()}`,
        journeyId,
        targetProjectId: input.targetProjectId,
        sequence: 1,
        eventType: 'JOURNEY_CREATED',
        predecessorStateHash: initial.stateHash,
        successorStateHash: initial.stateHash,
        payloadJson: json({ revisionId, revisionHash }),
      },
    })
    return row
  })
  return { replayed: false, journey: projection(created) }
}

export async function getQualityJourney(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const row = await readJourney(input.journeyId, input.targetProjectId, client)
  const [workItems, blockers, events] = await Promise.all([
    client.qualityJourneyWorkItem.findMany({ where: { journeyId: row.id }, orderBy: { createdAt: 'asc' } }),
    client.qualityJourneyBlocker.findMany({
      where: { journeyId: row.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyEvent.findMany({ where: { journeyId: row.id }, orderBy: { sequence: 'asc' } }),
  ])
  return {
    journey: projection(row),
    runner: reconstructQualityJourneyRunner(
      row.stage as QualityJourneyStage,
      workItems.map(item => ({ workItemId: item.id, role: item.role, status: item.status })),
      blockers.map(item => item.id),
    ),
    workItems,
    blockers,
    events,
  }
}

type JourneyCommand = ReturnType<typeof journeyCommandSchema.parse>
type AppliedJourneyCommand = ReturnType<typeof submitQualityJourneyCommand>

function commandConflict(
  command: JourneyCommand,
  row: QualityJourney,
  code: 'IDEMPOTENCY_KEY_REUSED' | 'PRECONDITION_FAILED' | 'STALE_STATE_HASH',
  safeNextCommands = projection(row).permittedCommands,
) {
  return journeyCommandResultSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    outcome: 'CONFLICT',
    commandId: command.commandId,
    code,
    currentStateHash: row.stateHash,
    currentStage: row.stage,
    safeNextCommands,
  })
}

function replayCommand(command: JourneyCommand, row: QualityJourney, existing: QualityJourneyCommand) {
  if (existing.requestHash !== hash(command)) return commandConflict(command, row, 'IDEMPOTENCY_KEY_REUSED')
  const replay = journeyCommandResultSchema.parse(JSON.parse(existing.resultJson))
  return replay.outcome === 'COMMITTED' ? { ...replay, replayed: true } : replay
}

async function runnerPreconditionConflict(command: JourneyCommand, row: QualityJourney, tx: Prisma.TransactionClient) {
  if (command.actor !== 'RUNNER') return null
  if (['RETRY_DISCOVERY', 'RETRY_AUTOMATION'].includes(command.command)) return null
  const activeIds = parseArray(row.activeWorkItemIdsJson)
  if (activeIds.length === 0) return null
  const incomplete = await tx.qualityJourneyWorkItem.count({
    where: { id: { in: activeIds }, status: { not: 'COMPLETED' } },
  })
  return incomplete ? commandConflict(command, row, 'PRECONDITION_FAILED') : null
}

async function loadKernelState(row: QualityJourney, tx: Prisma.TransactionClient) {
  const [commands, events] = await Promise.all([
    tx.qualityJourneyCommand.findMany({ where: { journeyId: row.id } }),
    tx.qualityJourneyEvent.findMany({ where: { journeyId: row.id }, orderBy: { sequence: 'asc' } }),
  ])
  const state: QualityJourneyKernelState = {
    ...projection(row),
    events: events.filter(event => event.commandId).map(event => JSON.parse(event.payloadJson)),
    committedCommands: Object.fromEntries(
      commands.map(receipt => [
        receipt.idempotencyKey,
        { requestHash: receipt.requestHash.replace(/^sha256:/, ''), result: JSON.parse(receipt.resultJson) },
      ]),
    ),
  }
  return { state, eventCount: events.length }
}

async function commitAppliedCommand(
  command: JourneyCommand,
  row: QualityJourney,
  applied: AppliedJourneyCommand,
  eventCount: number,
  tx: Prisma.TransactionClient,
) {
  if (applied.result.outcome !== 'COMMITTED') return applied.result
  const claimed = await tx.qualityJourney.updateMany({
    where: { id: row.id, version: row.version, stateHash: row.stateHash },
    data: {
      stage: applied.state.stage,
      activeRevisionIdsJson: json(applied.state.activeRevisionIds),
      analysisReviewHash: applied.state.analysisReviewHash ?? null,
      blockerIdsJson: json(applied.state.blockerIds),
      activeWorkItemIdsJson: json(applied.state.activeWorkItemIds),
      stateHash: applied.state.stateHash,
      version: { increment: 1 },
      status: applied.state.stage === 'CLOSED' ? 'CLOSED' : row.status,
    },
  })
  if (claimed.count !== 1) return commandConflict(command, row, 'STALE_STATE_HASH', projection(row).permittedCommands)
  const event = applied.state.events.at(-1)!
  await tx.qualityJourneyEvent.create({
    data: {
      id: event.eventId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      sequence: eventCount + 1,
      eventType: `COMMAND_${command.command}`,
      commandId: command.commandId,
      predecessorStateHash: event.predecessorStateHash,
      successorStateHash: event.successorStateHash,
      payloadJson: json(event),
    },
  })
  await tx.qualityJourneyCommand.create({
    data: {
      id: command.commandId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      idempotencyKey: command.idempotencyKey,
      requestHash: hash(command),
      requestJson: json(command),
      resultJson: json(applied.result),
      eventId: event.eventId,
    },
  })
  await persistAnalysisRevisionFeedbackArtifact(command, row, tx)
  const updated = await tx.qualityJourney.findUniqueOrThrow({ where: { id: row.id } })
  await ensureEligibleWorkItems(updated, tx)
  return applied.result
}

/** Revision feedback is Appraise-owned durable input: a fresh Analyzer gets a
 * reference it may read, never a prior worker transcript or hidden state. */
async function persistAnalysisRevisionFeedbackArtifact(
  command: JourneyCommand,
  row: QualityJourney,
  tx: Prisma.TransactionClient,
) {
  if (command.command !== 'REQUEST_ANALYSIS_REVISION') return
  const payload = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    feedbackId: `analysis-revision-feedback:${command.commandId}`,
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    reviewedRevisionId: command.payload.reviewedRevisionId,
    reviewedHash: command.payload.reviewedHash,
    feedback: command.payload.feedback,
    commandId: command.commandId,
  }
  const identityKey = `ANALYSIS_REVISION_FEEDBACK:${command.commandId}:unrevisioned`
  const contentHash = hash(payload)
  const existing = await tx.qualityJourneyArtifact.findUnique({
    where: { journeyId_identityKey: { journeyId: row.id, identityKey } },
  })
  if (existing) {
    if (existing.contentHash !== contentHash || existing.artifactJson !== json(payload))
      throw new ServiceError(
        'Analysis revision feedback artifact conflicts with immutable command identity.',
        'CONFLICT',
      )
    return existing
  }
  return tx.qualityJourneyArtifact.create({
    data: {
      id: `qjar_${createHash('sha256').update(`${row.id}:${identityKey}`).digest('hex').slice(0, 24)}`,
      identityKey,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      cycleId: row.activeCycleId,
      kind: 'ANALYSIS_REVISION_FEEDBACK',
      artifactId: payload.feedbackId,
      revisionId: command.payload.reviewedRevisionId,
      contentHash,
      artifactJson: json(payload),
    },
  })
}

export async function submitDurableQualityJourneyCommandInTransaction(value: unknown, tx: Prisma.TransactionClient) {
  const command = journeyCommandSchema.parse(value)
  const row = await readJourney(command.journeyId, command.targetProjectId, tx)
  const existing = await tx.qualityJourneyCommand.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: row.id, idempotencyKey: command.idempotencyKey } },
  })
  if (existing) return replayCommand(command, row, existing)
  const preconditionConflict = await runnerPreconditionConflict(command, row, tx)
  if (preconditionConflict) return preconditionConflict
  const { state, eventCount } = await loadKernelState(row, tx)
  const applied = submitQualityJourneyCommand(state, command)
  return commitAppliedCommand(command, row, applied, eventCount, tx)
}

export async function submitDurableQualityJourneyCommand(value: unknown, client: PrismaClient = prisma) {
  return client.$transaction(tx => submitDurableQualityJourneyCommandInTransaction(value, tx))
}

async function blockExpiredQualityJourneyWork(
  tx: Prisma.TransactionClient,
  attempt: QualityJourneyWorkAttempt,
  status: 'DISPATCH_UNRESOLVED' | 'LEASE_EXPIRED',
  completedAt: Date,
) {
  await tx.qualityJourneyWorkAttempt.update({
    where: { id: attempt.id },
    data: { status, completedAt },
  })
  await tx.qualityJourneyWorkItem.updateMany({
    where: { id: attempt.workItemId, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
    data: { status: 'BLOCKED', version: { increment: 1 } },
  })
}

async function createAttemptBudgetBlocker(
  tx: Prisma.TransactionClient,
  row: QualityJourney,
  attempt: QualityJourneyWorkAttempt,
) {
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId! } })
  if (!authorization) return
  const authorizationAttemptCount = await tx.qualityJourneyWorkAttempt.count({
    where: { authorizationId: authorization.id },
  })
  await tx.qualityJourneyBlocker.upsert({
    where: { id: `qjb_attempt_budget_${attempt.workItemId}` },
    update: {},
    create: {
      id: `qjb_attempt_budget_${attempt.workItemId}`,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED',
      summary: 'The work authorization exhausted its hard maximum attempt count.',
      evidenceJson: json({
        attemptId: attempt.id,
        attemptSequence: attempt.attempt,
        authorizationId: authorization.id,
        authorizationAttemptCount,
        maxAttempts: authorization.maxAttempts,
      }),
      responsibleActor: 'COORDINATOR',
      affectedNodeIdsJson: json([attempt.workItemId]),
      requiredResolution:
        'Start a new Quality Journey or use a future authorized re-authorization workflow; this exhausted authorization cannot be resumed.',
      safeResumeCommand: 'NONE',
    },
  })
}

async function resumeRefusedFactoryWork(row: QualityJourney, now: Date, tx: Prisma.TransactionClient) {
  const refused = await tx.qualityJourneyWorkAttempt.findMany({
    where: { workItem: { journeyId: row.id, targetProjectId: row.targetProjectId }, status: 'REFUSED' },
    include: { workItem: true, authorization: true },
  })
  const resumedAttemptIds: string[] = []
  for (const attempt of refused) {
    if (attempt.workItem.status !== 'BLOCKED' || attempt.workItem.currentAttempt !== attempt.attempt) continue
    const authorizationAttempts = attempt.authorization
      ? await tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: attempt.authorization.id } })
      : 0
    if (!attempt.authorization || authorizationAttempts >= attempt.authorization.maxAttempts) {
      if (attempt.authorization) {
        await tx.qualityJourneyBlocker.updateMany({
          where: { id: `qjb_factory_refused_${attempt.id}`, status: 'ACTIVE' },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            resolutionJson: json({ action: 'ATTEMPT_BUDGET_EXHAUSTED' }),
          },
        })
        await createAttemptBudgetBlocker(tx, row, attempt)
      }
      continue
    }
    const replaced = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: attempt.workItemId, status: 'BLOCKED', currentAttempt: attempt.attempt },
      data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
    })
    if (replaced.count !== 1) continue
    await tx.qualityJourneyBlocker.updateMany({
      where: { id: `qjb_factory_refused_${attempt.id}`, status: 'ACTIVE' },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        resolutionJson: json({ action: 'REPLACEMENT_REQUESTED', successorAttempt: attempt.attempt + 1 }),
      },
    })
    resumedAttemptIds.push(attempt.id)
  }
  return resumedAttemptIds
}

export async function resumeQualityJourney(
  input: { journeyId: string; targetProjectId: string; now?: Date },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  return client.$transaction(async tx => {
    const row = await readJourney(input.journeyId, input.targetProjectId, tx)
    const recoveredWorkItemIds = await recoverLegacyFactoryAuthorizations(row, tx)
    const expired = await tx.qualityJourneyWorkAttempt.findMany({
      where: {
        workItem: { journeyId: row.id },
        status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'] },
        leaseExpiresAt: { lte: now },
      },
    })
    for (const attempt of expired) {
      if (attempt.dispatchStartedAt && !attempt.spawnReceiptHash) {
        await blockExpiredQualityJourneyWork(tx, attempt, 'DISPATCH_UNRESOLVED', now)
        await tx.qualityJourneyBlocker.upsert({
          where: { id: `qjb_ambiguous_dispatch_${attempt.id}` },
          update: {},
          create: {
            id: `qjb_ambiguous_dispatch_${attempt.id}`,
            journeyId: row.id,
            targetProjectId: row.targetProjectId,
            reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH',
            summary:
              'A provider dispatch may have created a worker, but no durable receipt was returned before the lease expired.',
            evidenceJson: json({
              attemptId: attempt.id,
              dispatchKey: attempt.dispatchKey,
              adapterId: attempt.dispatchAdapterId,
            }),
            responsibleActor: 'COORDINATOR',
            affectedNodeIdsJson: json([attempt.workItemId]),
            requiredResolution:
              'Reconcile the persisted adapter dispatch key with the provider before any new worker is issued.',
            safeResumeCommand: 'adapter_reconciliation_required',
          },
        })
        continue
      }
      const authorization = attempt.authorizationId
        ? await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId } })
        : null
      const authorizationAttempts = authorization
        ? await tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: authorization.id } })
        : 0
      if (authorization && authorizationAttempts >= authorization.maxAttempts) {
        await blockExpiredQualityJourneyWork(tx, attempt, 'LEASE_EXPIRED', now)
        await createAttemptBudgetBlocker(tx, row, attempt)
        continue
      }
      await tx.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { status: 'LEASE_EXPIRED', completedAt: now },
      })
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: attempt.workItemId, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
    }
    const resumedRefusedAttemptIds = await resumeRefusedFactoryWork(row, now, tx)
    await ensureEligibleWorkItems(row, tx)
    return {
      recoveredWorkItemIds,
      expiredAttemptIds: expired.map(item => item.id),
      resumedRefusedAttemptIds,
      journey: projection(row),
    }
  })
}

async function replacementArtifactProjection(
  item: QualityJourneyWorkItem,
  db: Db,
): Promise<{ inputArtifacts: AssignmentManifest['inputArtifacts']; projectionHash: string }> {
  const declared = JSON.parse(item.inputArtifactRefsJson) as AssignmentManifest['inputArtifacts']
  const { roleDefinition } = roleAuthority(item.role as QualityJourneyRole)
  const journey = await readJourney(item.journeyId, item.targetProjectId, db)
  const activeRevisionIds = Object.values(parseRecord(journey.activeRevisionIdsJson))
  const durable = await db.qualityJourneyArtifact.findMany({
    where: {
      journeyId: item.journeyId,
      cycleId: item.cycleId,
      kind: { in: [...roleDefinition.readableArtifacts] },
      OR: [{ revisionId: { in: activeRevisionIds } }, { revisionId: null }],
    },
    orderBy: [{ kind: 'asc' }, { artifactId: 'asc' }, { revisionId: 'asc' }],
  })
  const entries = [
    ...declared,
    ...durable.map(artifact => ({
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      ...(artifact.revisionId ? { revisionId: artifact.revisionId } : {}),
      contentHash: artifact.contentHash,
    })),
  ] as AssignmentManifest['inputArtifacts']
  const inputArtifacts = Object.values(
    Object.fromEntries(
      entries.map(reference => [`${reference.kind}:${reference.artifactId}:${reference.revisionId ?? ''}`, reference]),
    ),
  ).sort((left, right) =>
    canonicalContractJson(left).localeCompare(canonicalContractJson(right)),
  ) as AssignmentManifest['inputArtifacts']
  return {
    inputArtifacts,
    projectionHash: hash({ workItemId: item.id, cycleId: item.cycleId, activeRevisionIds, inputArtifacts }),
  }
}

function assertClaimableAuthorization(authorization: { revokedAt: Date | null; cancelledAt: Date | null }) {
  if (authorization.revokedAt)
    throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
  if (authorization.cancelledAt)
    throw new ServiceError('Quality Journey work authorization has been cancelled.', 'CONFLICT')
}

async function deriveClaimInput(item: QualityJourneyWorkItem, authorization: FactoryAuthorization, db: Db) {
  if (item.status !== 'REPLACEMENT_REQUESTED')
    return { inputArtifacts: authorization.inputArtifacts, inputHash: item.inputHash, projectionHash: null }
  const projection = await replacementArtifactProjection(item, db)
  return { ...projection, inputHash: hash({ workItemId: item.id, projectionHash: projection.projectionHash }) }
}

async function persistWorkClaim(item: QualityJourneyWorkItem, inputHash: string, tx: Prisma.TransactionClient) {
  const attempt = item.currentAttempt + 1
  const claimed = await tx.qualityJourneyWorkItem.updateMany({
    where: { id: item.id, version: item.version, status: item.status },
    data: { status: 'WORKER_REQUESTED', currentAttempt: attempt, inputHash, version: { increment: 1 } },
  })
  if (claimed.count !== 1) throw new ServiceError('Quality Journey work item was claimed concurrently.', 'CONFLICT')
  return attempt
}

async function priorWorkAttempt(item: QualityJourneyWorkItem, tx: Prisma.TransactionClient) {
  if (item.status !== 'REPLACEMENT_REQUESTED') return null
  return tx.qualityJourneyWorkAttempt.findFirst({ where: { workItemId: item.id }, orderBy: { attempt: 'desc' } })
}

function manifestForClaim(
  authorization: FactoryAuthorization,
  item: QualityJourneyWorkItem,
  attempt: { id: string; leaseId: string; leaseExpiresAt: Date; heartbeatSeconds: number },
  inputArtifacts: AssignmentManifest['inputArtifacts'],
  replacement: AssignmentManifest['replacement'],
) {
  const manifest = assignmentFromAuthorization(authorization, item, attempt, inputArtifacts)
  if (item.status !== 'REPLACEMENT_REQUESTED') return manifest
  return createReplacementAssignment(manifest, {
    assignmentId: manifest.assignmentId,
    stateHash: manifest.stateHash,
    inputHash: manifest.inputHash,
    inputArtifacts,
    lease: manifest.lease,
    idempotencyKey: manifest.idempotencyKey,
    replacement: replacement!,
  })
}

function predecessorDiagnostics(prior: QualityJourneyWorkAttempt | null, projectionHash: string | null) {
  if (!prior || !projectionHash) return null
  return {
    projectionHash,
    predecessorAttemptId: prior.id,
    diagnostics: {
      status: prior.status,
      ...(prior.completedAt ? { completedAt: prior.completedAt.toISOString() } : {}),
      ...(prior.resultHash ? { resultHash: prior.resultHash } : {}),
      ...(prior.failureJson ? { failureHash: hash(JSON.parse(prior.failureJson)) } : {}),
    },
  } satisfies NonNullable<AssignmentManifest['replacement']>
}

export async function claimQualityJourneyWork(
  input: { journeyId: string; targetProjectId: string; role: QualityJourneyRole; leaseSeconds?: number },
  client: PrismaClient = prisma,
) {
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 120, 30), 900)
  return client.$transaction(async tx => {
    const journey = await readJourney(input.journeyId, input.targetProjectId, tx)
    await ensureEligibleWorkItems(journey, tx)
    const item = await tx.qualityJourneyWorkItem.findFirst({
      where: { journeyId: journey.id, role: input.role, status: { in: ['ELIGIBLE', 'REPLACEMENT_REQUESTED'] } },
      orderBy: { createdAt: 'asc' },
    })
    if (!item) throw new ServiceError('No eligible Quality Journey work item is available.', 'CONFLICT')
    const authorization = await currentWorkAuthorization(item.id, tx)
    if (!authorization)
      throw new ServiceError('Quality Journey work has no issued Factory authorization.', 'UNAUTHORIZED')
    assertClaimableAuthorization(authorization)
    const authorizationAttemptCount = await tx.qualityJourneyWorkAttempt.count({
      where: { authorizationId: authorization.id },
    })
    if (authorizationAttemptCount >= authorization.maxAttempts)
      throw new ServiceError('Quality Journey work has exhausted its maximum attempt budget.', 'CONFLICT')
    const authorizationPayload = validateFactoryAuthorization(authorization, journey, item)
    const { inputArtifacts, inputHash, projectionHash } = await deriveClaimInput(item, authorizationPayload, tx)
    const attempt = await persistWorkClaim(item, inputHash, tx)
    const ownerToken = randomUUID()
    const leaseId = `qjl_${randomUUID()}`
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000)
    const attemptId = `qja_${randomUUID()}`
    const prior = await priorWorkAttempt(item, tx)
    const replacement = predecessorDiagnostics(prior, projectionHash)
    const heartbeatSeconds = Math.max(10, Math.floor(leaseSeconds / 3))
    const claimedItem = { ...item, inputHash }
    const manifest = manifestForClaim(
      authorizationPayload,
      claimedItem,
      { id: attemptId, leaseId, leaseExpiresAt, heartbeatSeconds },
      inputArtifacts,
      replacement ?? undefined,
    )
    const spawnRequest = createWorkerSpawnRequest({
      requestId: `qjsr_${randomUUID()}`,
      attemptId,
      manifest,
    })
    const workAttempt = await tx.qualityJourneyWorkAttempt.create({
      data: {
        id: attemptId,
        workItemId: item.id,
        attempt,
        status: 'WORKER_REQUESTED',
        leaseId,
        ownerTokenHash: tokenHash(ownerToken),
        leaseExpiresAt,
        heartbeatSeconds,
        authorizationId: authorization.id,
        assignmentId: manifest.assignmentId,
        assignmentJson: json(manifest),
        assignmentHash: hash(manifest),
        spawnRequestId: spawnRequest.requestId,
        spawnRequestJson: json(spawnRequest),
        spawnRequestHash: hash(spawnRequest),
        dispatchKey: `qjd_${createHash('sha256').update(attemptId).digest('hex').slice(0, 24)}`,
        replacesAttemptId: prior?.id,
        replacementProjectionHash: replacement?.projectionHash,
        predecessorDiagnosticsJson: replacement ? json(replacement.diagnostics) : null,
      },
    })
    return {
      workItem: { ...claimedItem, status: 'WORKER_REQUESTED' as const, currentAttempt: attempt },
      attempt: workAttempt,
      assignment: manifest,
      spawnRequest,
      ownerToken,
    }
  })
}

export type WorkCompletionInput = {
  journeyId: string
  targetProjectId: string
  workItemId: string
  leaseId: string
  ownerToken: string
  result: unknown
}
type WorkerResult = ReturnType<typeof workerResultEnvelopeSchema.parse>

type WorkLeaseInput = Omit<WorkCompletionInput, 'result'>
type WorkSpawnReceiptInput = WorkLeaseInput & { receipt: unknown }

function assertLeaseAuthority(
  input: Pick<WorkCompletionInput, 'ownerToken'>,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt | null,
) {
  if (!attempt || attempt.workItemId !== item.id || attempt.ownerTokenHash !== tokenHash(input.ownerToken))
    throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  return attempt
}

async function readWorkAttempt(input: WorkLeaseInput, tx: Prisma.TransactionClient) {
  await readJourney(input.journeyId, input.targetProjectId, tx)
  const item = await readScopedWorkItem(input, tx)
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: input.leaseId } })
  const authorization = attempt?.authorizationId
    ? await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId } })
    : null
  return { item, attempt, authorization }
}

async function readScopedWorkItem(
  input: Pick<WorkLeaseInput, 'journeyId' | 'targetProjectId' | 'workItemId'>,
  tx: Prisma.TransactionClient,
) {
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: { id: input.workItemId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!item) throw new ServiceError('Quality Journey work item not found.', 'NOT_FOUND')
  return item
}

function assertFactoryAuthorityCurrent(
  item: QualityJourneyWorkItem,
  authorization: { revokedAt: Date | null; cancelledAt: Date | null } | null,
) {
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  if (authorization.revokedAt)
    throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
  if (authorization.cancelledAt || item.status === 'CANCELLED')
    throw new ServiceError('Quality Journey work has been cancelled.', 'CONFLICT')
}

function validatedSpawnReceipt(input: WorkSpawnReceiptInput, attempt: QualityJourneyWorkAttempt) {
  if (!attempt.spawnRequestJson || !attempt.spawnRequestHash)
    throw new ServiceError('Quality Journey worker request was not durably issued.', 'UNAUTHORIZED')
  const spawnRequest = JSON.parse(attempt.spawnRequestJson)
  if (attempt.spawnRequestHash !== hash(spawnRequest))
    throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
  let receipt: ReturnType<typeof validateWorkerSpawnReceipt>
  try {
    receipt = validateWorkerSpawnReceipt(input.receipt, spawnRequest)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown spawn receipt validation error.'
    throw new ServiceError(`Quality Journey worker receipt is invalid: ${message}`, 'VALIDATION')
  }
  return { receipt, receiptHash: hash(receipt) }
}

function replayedSpawnReceipt(item: QualityJourneyWorkItem, attempt: QualityJourneyWorkAttempt, receiptHash: string) {
  if (!attempt.spawnReceiptHash) return null
  if (attempt.spawnReceiptHash !== receiptHash)
    throw new ServiceError('Quality Journey worker receipt was replayed with different input.', 'CONFLICT')
  return { replayed: true, workItemId: item.id, status: item.status }
}

function assertSpawnReceiptCurrent(item: QualityJourneyWorkItem, attempt: QualityJourneyWorkAttempt) {
  if (attempt.leaseExpiresAt <= new Date()) throw new ServiceError('Quality Journey work lease expired.', 'CONFLICT')
  if (item.currentAttempt !== attempt.attempt || item.status !== 'WORKER_REQUESTED')
    throw new ServiceError('Quality Journey worker receipt is stale.', 'CONFLICT')
}

function assertDispatchReservation(attempt: QualityJourneyWorkAttempt) {
  if (!attempt.dispatchKey || !attempt.dispatchReservedAt || !attempt.dispatchStartedAt)
    throw new ServiceError('Quality Journey worker receipt has no durable dispatch reservation.', 'UNAUTHORIZED')
}

/** Adapter-only ingress. This is intentionally private: an MCP caller with a
 * lease token must not be able to manufacture Factory evidence. */
async function recordAdapterSpawnReceipt(input: WorkSpawnReceiptInput, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const loaded = await readWorkAttempt(input, tx)
    const { item } = loaded
    assertFactoryAuthorityCurrent(item, loaded.authorization)
    const attempt = assertLeaseAuthority(input, item, loaded.attempt)
    assertDispatchReservation(attempt)
    const { receipt, receiptHash } = validatedSpawnReceipt(input, attempt)
    const replay = replayedSpawnReceipt(item, attempt, receiptHash)
    if (replay) return replay
    assertSpawnReceiptCurrent(item, attempt)
    const refused = receipt.outcome === 'REFUSED'
    const recorded = await tx.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, spawnReceiptId: null, status: 'WORKER_REQUESTED' },
      data: {
        status: refused ? 'REFUSED' : 'IN_PROGRESS',
        spawnReceiptId: receipt.spawnReceiptId,
        spawnReceiptJson: json(receipt),
        spawnReceiptHash: receiptHash,
      },
    })
    if (recorded.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    const started = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, version: item.version, currentAttempt: attempt.attempt, status: 'WORKER_REQUESTED' },
      data: { status: refused ? 'BLOCKED' : 'IN_PROGRESS', version: { increment: 1 } },
    })
    if (started.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    if (refused) {
      await tx.qualityJourneyBlocker.create({
        data: {
          id: `qjb_factory_refused_${attempt.id}`,
          journeyId: input.journeyId,
          targetProjectId: input.targetProjectId,
          reasonCode: receipt.refusalCode,
          summary: 'The selected Factory adapter refused the requested worker capability boundary.',
          evidenceJson: json({ attemptId: attempt.id, receiptHash, refusalCode: receipt.refusalCode }),
          responsibleActor: 'COORDINATOR',
          affectedNodeIdsJson: json([item.id]),
          requiredResolution: 'Select or configure an adapter that can satisfy the required runtime boundary.',
          safeResumeCommand: 'quality_journey_resume',
        },
      })
    }
    return refused
      ? { replayed: false, workItemId: item.id, status: 'BLOCKED' as const, outcome: 'REFUSED' as const }
      : { replayed: false, workItemId: item.id, status: 'IN_PROGRESS' as const, outcome: 'STARTED' as const }
  })
}

async function releaseFailedDispatchReservation(input: WorkLeaseInput, adapterId: string, client: PrismaClient) {
  await client.qualityJourneyWorkAttempt.updateMany({
    where: {
      leaseId: input.leaseId,
      workItemId: input.workItemId,
      status: 'WORKER_REQUESTED',
      spawnReceiptId: null,
      dispatchAdapterId: adapterId,
    },
    data: { dispatchReservedAt: null, dispatchStartedAt: null },
  })
}

async function markDispatchUnresolved(input: WorkLeaseInput, adapterId: string, client: PrismaClient) {
  await client.$transaction(async tx => {
    const attempt = await tx.qualityJourneyWorkAttempt.findFirst({
      where: {
        leaseId: input.leaseId,
        workItemId: input.workItemId,
        status: 'WORKER_REQUESTED',
        spawnReceiptId: null,
        dispatchAdapterId: adapterId,
        dispatchStartedAt: { not: null },
      },
    })
    if (!attempt) return
    await tx.qualityJourneyWorkAttempt.update({ where: { id: attempt.id }, data: { status: 'DISPATCH_UNRESOLVED' } })
    await tx.qualityJourneyWorkItem.updateMany({
      where: { id: attempt.workItemId, status: 'WORKER_REQUESTED' },
      data: { status: 'BLOCKED', version: { increment: 1 } },
    })
    await tx.qualityJourneyBlocker.upsert({
      where: { id: `qjb_ambiguous_dispatch_${attempt.id}` },
      update: {},
      create: {
        id: `qjb_ambiguous_dispatch_${attempt.id}`,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH',
        summary: 'A provider dispatch may have created a worker, but its response was not durably received.',
        evidenceJson: json({ attemptId: attempt.id, dispatchKey: attempt.dispatchKey, adapterId }),
        responsibleActor: 'COORDINATOR',
        affectedNodeIdsJson: json([attempt.workItemId]),
        requiredResolution:
          'Reconcile the persisted adapter dispatch key with the provider before any new worker is issued.',
        safeResumeCommand: 'adapter_reconciliation_required',
      },
    })
  })
}

/** Dispatch is an Appraise-owned handoff. The selected adapter identity and
 * idempotency key are durable, while a failed call releases only the in-flight
 * reservation so that the same adapter may retry the exact request. */
function publicDispatchProjection(input: {
  replayed: boolean
  status: string
  workItemId: string
  attemptId: string
  spawnReceiptId?: string | null
  spawnReceiptHash?: string | null
  adapterId?: string | null
}) {
  return {
    replayed: input.replayed,
    status: input.status,
    workItemId: input.workItemId,
    attemptId: input.attemptId,
    ...(input.spawnReceiptId ? { spawnReceiptId: input.spawnReceiptId } : {}),
    ...(input.spawnReceiptHash ? { spawnReceiptHash: input.spawnReceiptHash } : {}),
    ...(input.adapterId ? { adapterId: input.adapterId } : {}),
  }
}

export async function dispatchQualityJourneyWork(input: WorkLeaseInput, client: PrismaClient = prisma) {
  const pending = await client.$transaction(async tx => {
    const loaded = await readWorkAttempt(input, tx)
    assertFactoryAuthorityCurrent(loaded.item, loaded.authorization)
    const attempt = assertLeaseAuthority(input, loaded.item, loaded.attempt)
    if (attempt.spawnReceiptJson && attempt.spawnReceiptHash) {
      if (attempt.spawnReceiptHash !== hash(JSON.parse(attempt.spawnReceiptJson)))
        throw new ServiceError('Quality Journey worker receipt lineage is invalid.', 'UNAUTHORIZED')
      return {
        replay: true as const,
        status: loaded.item.status,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        spawnReceiptId: attempt.spawnReceiptId,
        spawnReceiptHash: attempt.spawnReceiptHash,
        adapterId: attempt.dispatchAdapterId,
      }
    }
    if (attempt.status === 'DISPATCH_UNRESOLVED')
      return {
        replay: true as const,
        unresolved: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId: attempt.dispatchAdapterId,
      }
    if (attempt.status !== 'WORKER_REQUESTED' || attempt.leaseExpiresAt <= new Date())
      throw new ServiceError('Quality Journey worker dispatch is stale.', 'CONFLICT')
    if (!attempt.spawnRequestJson || attempt.spawnRequestHash !== hash(JSON.parse(attempt.spawnRequestJson ?? 'null')))
      throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
    if (!attempt.dispatchKey)
      throw new ServiceError('Quality Journey worker dispatch key is unavailable.', 'UNAUTHORIZED')
    const request = JSON.parse(attempt.spawnRequestJson)
    let adapterId: string
    try {
      adapterId = resolveAgentFactoryProviderAdapter(request, attempt.dispatchAdapterId ?? undefined).adapter.adapterId
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No compatible provider adapter is available.'
      throw new ServiceError(`Quality Journey worker dispatch was blocked: ${message}`, 'CONFLICT')
    }
    if (attempt.dispatchStartedAt)
      return {
        replay: true as const,
        pending: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId,
      }
    const now = new Date()
    const reserved = await tx.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchReservedAt: null, dispatchStartedAt: null, status: 'WORKER_REQUESTED' },
      data: { dispatchAdapterId: adapterId, dispatchReservedAt: now, dispatchStartedAt: now },
    })
    if (reserved.count !== 1) {
      return {
        replay: true as const,
        pending: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId,
      }
    }
    return {
      replay: false as const,
      request,
      dispatchKey: attempt.dispatchKey,
      adapterId,
      workItemId: loaded.item.id,
      attemptId: attempt.id,
    }
  })
  if ('unresolved' in pending)
    return publicDispatchProjection({
      replayed: true,
      status: 'DISPATCH_UNRESOLVED',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  if ('pending' in pending)
    return publicDispatchProjection({
      replayed: true,
      status: 'DISPATCH_PENDING',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  if (pending.replay)
    return publicDispatchProjection({
      replayed: true,
      status: pending.status,
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      spawnReceiptId: pending.spawnReceiptId,
      spawnReceiptHash: pending.spawnReceiptHash,
      adapterId: pending.adapterId,
    })
  let dispatched: Awaited<ReturnType<typeof dispatchWorkerSpawnRequest>>
  try {
    dispatched = await dispatchWorkerSpawnRequest(pending.request, pending.dispatchKey, pending.adapterId)
  } catch (error) {
    if (error instanceof AgentFactoryDispatchNotStartedError) {
      await releaseFailedDispatchReservation(input, pending.adapterId, client)
      const message = error.message
      throw new ServiceError(`Quality Journey worker dispatch was blocked: ${message}`, 'CONFLICT')
    }
    await markDispatchUnresolved(input, pending.adapterId, client)
    return publicDispatchProjection({
      replayed: false,
      status: 'DISPATCH_UNRESOLVED',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  }
  const recorded = await recordAdapterSpawnReceipt({ ...input, receipt: dispatched.receipt }, client)
  return publicDispatchProjection({
    replayed: recorded.replayed,
    status: recorded.status,
    workItemId: recorded.workItemId,
    attemptId: pending.attemptId,
    spawnReceiptId: dispatched.receipt.spawnReceiptId,
    spawnReceiptHash: hash(dispatched.receipt),
    adapterId: dispatched.adapterId,
  })
}

type FactoryControlActor = 'USER' | 'COORDINATOR' | 'RUNNER'
type WorkTerminationInput = {
  journeyId: string
  targetProjectId: string
  workItemId: string
  actor: FactoryControlActor
  reason: string
}

async function readWorkAuthorizationForControl(input: WorkTerminationInput, tx: Prisma.TransactionClient) {
  await readJourney(input.journeyId, input.targetProjectId, tx)
  const item = await readScopedWorkItem(input, tx)
  const authorization = await currentWorkAuthorization(item.id, tx)
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  return { item, authorization }
}

async function cancelActiveWorkAttempts(
  workItemId: string,
  actor: FactoryControlActor,
  reason: string,
  tx: Prisma.TransactionClient,
) {
  await tx.qualityJourneyWorkAttempt.updateMany({
    where: { workItemId, status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'] } },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: actor,
      cancellationReason: reason,
      completedAt: new Date(),
    },
  })
}

export async function cancelQualityJourneyWork(input: WorkTerminationInput, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const { item, authorization } = await readWorkAuthorizationForControl(input, tx)
    if (authorization.revokedAt)
      throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
    if (authorization.cancelledAt || item.status === 'CANCELLED')
      return { replayed: true, workItemId: item.id, status: 'CANCELLED' as const }
    if (item.status === 'COMPLETED')
      throw new ServiceError('Completed Quality Journey work cannot be cancelled.', 'CONFLICT')
    const cancelled = await tx.qualityJourneyWorkAuthorization.updateMany({
      where: { id: authorization.id, cancelledAt: null, revokedAt: null },
      data: { cancelledAt: new Date(), cancelledBy: input.actor, cancellationReason: input.reason },
    })
    if (cancelled.count !== 1)
      throw new ServiceError('Quality Journey work cancellation changed concurrently.', 'CONFLICT')
    await cancelActiveWorkAttempts(item.id, input.actor, input.reason, tx)
    await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, status: { not: 'COMPLETED' } },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    })
    return { replayed: false, workItemId: item.id, status: 'CANCELLED' as const }
  })
}

export async function revokeQualityJourneyWorkAuthorization(
  input: WorkTerminationInput,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const { item, authorization } = await readWorkAuthorizationForControl(input, tx)
    if (authorization.revokedAt) return { replayed: true, workItemId: item.id, status: item.status }
    const revoked = await tx.qualityJourneyWorkAuthorization.updateMany({
      where: { id: authorization.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: input.actor, revocationReason: input.reason },
    })
    if (revoked.count !== 1) throw new ServiceError('Quality Journey work revocation changed concurrently.', 'CONFLICT')
    await cancelActiveWorkAttempts(item.id, input.actor, input.reason, tx)
    if (item.status !== 'COMPLETED')
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: item.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      })
    return { replayed: false, workItemId: item.id, status: item.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED' }
  })
}

function validateWorkAttempt(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt | null,
  result: WorkerResult,
) {
  const authorizedAttempt = assertLeaseAuthority(input, item, attempt)
  if (authorizedAttempt.status === 'COMPLETED') {
    if (authorizedAttempt.resultHash !== hash(result))
      throw new ServiceError('Quality Journey work completion was replayed with a different result.', 'CONFLICT')
    return { replayed: true, workItemId: item.id, status: item.status }
  }
  if (authorizedAttempt.leaseExpiresAt <= new Date())
    throw new ServiceError('Quality Journey work lease expired.', 'CONFLICT')
  if (item.currentAttempt !== authorizedAttempt.attempt || item.status !== 'IN_PROGRESS')
    throw new ServiceError('Quality Journey work completion is stale.', 'CONFLICT')
  const claimedValues = [item.id, authorizedAttempt.id, item.inputHash, item.role, item.roleContractDigest]
  const resultValues = [result.workItemId, result.attemptId, result.inputHash, result.role, result.roleContractDigest]
  if (claimedValues.some((value, index) => value !== resultValues[index]))
    throw new ServiceError('Worker result does not match the claimed Quality Journey work item.', 'CONFLICT')
  return null
}

async function persistWorkerOutputs(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  for (const output of result.outputs) {
    const identityKey = `${output.kind}:${output.artifactId}:${output.revisionId ?? 'unrevisioned'}`
    const existing = await tx.qualityJourneyArtifact.findUnique({
      where: { journeyId_identityKey: { journeyId: input.journeyId, identityKey } },
    })
    if (existing && existing.contentHash !== output.contentHash)
      throw new ServiceError('Quality Journey artifact identity already has different immutable content.', 'CONFLICT')
    if (existing) continue
    await tx.qualityJourneyArtifact.create({
      data: {
        id: `qja_${createHash('sha256').update(`${input.journeyId}:${identityKey}`).digest('hex').slice(0, 24)}`,
        identityKey,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: item.cycleId,
        kind: output.kind,
        artifactId: output.artifactId,
        revisionId: output.revisionId,
        contentHash: output.contentHash,
        artifactJson: json(output),
      },
    })
  }
}

async function advanceAfterWorkCompletion(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  const journey = await readJourney(input.journeyId, input.targetProjectId, tx)
  const predecessorStateHash = journey.stateHash
  const activeWorkItemIds = parseArray(journey.activeWorkItemIdsJson).filter(id => id !== item.id)
  const current = projection(journey)
  const successorStateHash = hashQualityJourneyState({ ...current, activeWorkItemIds })
  const advanced = await tx.qualityJourney.updateMany({
    where: { id: journey.id, version: journey.version, stateHash: predecessorStateHash },
    data: { activeWorkItemIdsJson: json(activeWorkItemIds), stateHash: successorStateHash, version: { increment: 1 } },
  })
  if (advanced.count !== 1) throw new ServiceError('Quality Journey changed during work completion.', 'CONFLICT')
  const sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1
  await tx.qualityJourneyEvent.create({
    data: {
      id: `qje_${randomUUID()}`,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      sequence,
      eventType: 'WORK_COMPLETED',
      predecessorStateHash,
      successorStateHash,
      payloadJson: json({ workItemId: item.id, attemptId: attempt.id, resultHash: hash(result) }),
    },
  })
}

async function validateDurableWorkerLineage(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  const lineage = [
    attempt.authorizationId,
    attempt.assignmentJson,
    attempt.assignmentHash,
    attempt.spawnRequestJson,
    attempt.spawnRequestHash,
    attempt.spawnReceiptJson,
    attempt.spawnReceiptHash,
  ]
  if (lineage.some(value => !value))
    throw new ServiceError('Quality Journey work completion has no validated Factory receipt.', 'UNAUTHORIZED')
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({
    where: { id: attempt.authorizationId! },
  })
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  const journey = await readJourney(input.journeyId, input.targetProjectId, tx)
  const authorizationPayload = validateFactoryAuthorization(authorization, journey, item)
  const persistedAssignment = JSON.parse(attempt.assignmentJson!)
  const expectedAssignment = assignmentFromAuthorization(authorizationPayload, item, attempt)
  const assignmentBindings = [
    [persistedAssignment.assignmentId, expectedAssignment.assignmentId],
    [persistedAssignment.journeyId, expectedAssignment.journeyId],
    [persistedAssignment.targetProjectId, expectedAssignment.targetProjectId],
    [persistedAssignment.workItemId, expectedAssignment.workItemId],
    [json(persistedAssignment.roleDefinition), json(expectedAssignment.roleDefinition)],
    [json(persistedAssignment.capabilityProfile), json(expectedAssignment.capabilityProfile)],
    [json(persistedAssignment.allowedTargetRoutes), json(expectedAssignment.allowedTargetRoutes)],
    [json(persistedAssignment.allowedResourceIds), json(expectedAssignment.allowedResourceIds)],
    [json(persistedAssignment.writableArtifactKinds), json(expectedAssignment.writableArtifactKinds)],
    [json(persistedAssignment.scope), json(expectedAssignment.scope)],
    [json(persistedAssignment.completionCriteria), json(expectedAssignment.completionCriteria)],
    [persistedAssignment.inputHash, item.inputHash],
    [persistedAssignment.stateHash, item.inputHash],
    [json(persistedAssignment.lease), json(expectedAssignment.lease)],
    [persistedAssignment.idempotencyKey, expectedAssignment.idempotencyKey],
  ]
  if (
    attempt.assignmentHash !== hash(persistedAssignment) ||
    assignmentBindings.some(([actual, expected]) => actual !== expected)
  )
    throw new ServiceError('Quality Journey assignment lineage is invalid.', 'UNAUTHORIZED')
  if (attempt.replacementProjectionHash) {
    const replacement = persistedAssignment.replacement
    if (
      !replacement ||
      replacement.projectionHash !== attempt.replacementProjectionHash ||
      !attempt.predecessorDiagnosticsJson ||
      json(replacement.diagnostics) !== json(JSON.parse(attempt.predecessorDiagnosticsJson))
    )
      throw new ServiceError('Quality Journey replacement assignment lineage is invalid.', 'UNAUTHORIZED')
  } else if (
    persistedAssignment.replacement ||
    json(persistedAssignment.inputArtifacts) !== json(expectedAssignment.inputArtifacts)
  )
    throw new ServiceError('Quality Journey assignment lineage is invalid.', 'UNAUTHORIZED')
  const spawnRequest = JSON.parse(attempt.spawnRequestJson!)
  const spawnReceipt = JSON.parse(attempt.spawnReceiptJson!)
  const requestBindings = [
    [attempt.spawnRequestHash, hash(spawnRequest)],
    [attempt.spawnReceiptHash, hash(spawnReceipt)],
    [spawnRequest.assignmentId, attempt.assignmentId],
    [spawnRequest.requestId, attempt.spawnRequestId],
  ]
  if (requestBindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
  try {
    validateWorkerResult(result, { spawnRequest, spawnReceipt, currentInputHash: item.inputHash })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error.'
    throw new ServiceError(`Quality Journey worker result is invalid: ${message}`, 'CONFLICT')
  }
}

export async function completeQualityJourneyWorkInTransaction(
  input: WorkCompletionInput,
  tx: Prisma.TransactionClient,
) {
  const result = workerResultEnvelopeSchema.parse(input.result)
  const { item, attempt, authorization } = await readWorkAttempt(input, tx)
  assertFactoryAuthorityCurrent(item, authorization)
  if (attempt && attempt.status !== 'COMPLETED' && (!attempt.spawnReceiptJson || !attempt.spawnReceiptHash))
    throw new ServiceError('Quality Journey work completion has no validated Factory receipt.', 'UNAUTHORIZED')
  const replay = validateWorkAttempt(input, item, attempt, result)
  if (replay) return replay
  if (!attempt) throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  await validateDurableWorkerLineage(input, item, attempt, result, tx)
  await persistWorkerOutputs(input, item, result, tx)
  await tx.qualityJourneyWorkAttempt.update({
    where: { id: attempt.id },
    data: { status: 'COMPLETED', completedAt: new Date(), resultJson: json(result), resultHash: hash(result) },
  })
  await tx.qualityJourneyWorkItem.update({
    where: { id: item.id },
    data: { status: 'COMPLETED', version: { increment: 1 } },
  })
  await advanceAfterWorkCompletion(input, item, attempt, result, tx)
  return { replayed: false, workItemId: item.id, status: 'COMPLETED' as const }
}

export async function completeQualityJourneyWork(input: WorkCompletionInput, client: PrismaClient = prisma) {
  return client.$transaction(tx => completeQualityJourneyWorkInTransaction(input, tx))
}

export async function listQualityJourneyArtifacts(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  await readJourney(input.journeyId, input.targetProjectId, client)
  const [revisions, cycles, artifacts, links] = await Promise.all([
    client.qualityJourneyRevision.findMany({ where: { journeyId: input.journeyId }, orderBy: { revision: 'asc' } }),
    client.qualityJourneyCycle.findMany({ where: { journeyId: input.journeyId }, orderBy: { sequence: 'asc' } }),
    client.qualityJourneyArtifact.findMany({ where: { journeyId: input.journeyId }, orderBy: { createdAt: 'asc' } }),
    client.qualityJourneyArtifactLink.findMany({
      where: { journeyId: input.journeyId },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return { revisions, cycles, artifacts, links }
}

/** Read-only Factory evidence deliberately exposes hashes and enforcement state,
 * not lease secrets, provider prompts, worker transcripts, or credentials. */
export async function inspectQualityJourneyFactoryEvidence(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  await readJourney(input.journeyId, input.targetProjectId, client)
  const [authorizations, attempts] = await Promise.all([
    client.qualityJourneyWorkAuthorization.findMany({
      where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyWorkAttempt.findMany({
      where: { workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId } },
      orderBy: [{ workItemId: 'asc' }, { attempt: 'asc' }],
    }),
  ])
  return {
    authorizations: authorizations.map(authorization => ({
      authorizationId: authorization.id,
      workItemId: authorization.workItemId,
      role: authorization.role,
      roleContractDigest: authorization.roleContractDigest,
      capabilityProfileId: authorization.capabilityProfileId,
      capabilityProfileHash: authorization.capabilityProfileHash,
      authorizationHash: authorization.authorizationHash,
      maxAttempts: authorization.maxAttempts,
      cancelledAt: authorization.cancelledAt,
      cancelledBy: authorization.cancelledBy,
      revokedAt: authorization.revokedAt,
      revokedBy: authorization.revokedBy,
    })),
    attempts: attempts.map(attempt => ({
      attemptId: attempt.id,
      workItemId: attempt.workItemId,
      attempt: attempt.attempt,
      status: attempt.status,
      authorizationId: attempt.authorizationId,
      assignmentId: attempt.assignmentId,
      assignmentHash: attempt.assignmentHash,
      spawnRequestId: attempt.spawnRequestId,
      spawnRequestHash: attempt.spawnRequestHash,
      dispatchKey: attempt.dispatchKey,
      dispatchAdapterId: attempt.dispatchAdapterId,
      dispatchReservedAt: attempt.dispatchReservedAt,
      dispatchStartedAt: attempt.dispatchStartedAt,
      spawnReceiptId: attempt.spawnReceiptId,
      spawnReceiptHash: attempt.spawnReceiptHash,
      resultHash: attempt.resultHash,
      replacesAttemptId: attempt.replacesAttemptId,
      replacementProjectionHash: attempt.replacementProjectionHash,
      predecessorDiagnosticsHash: attempt.predecessorDiagnosticsJson
        ? hash(JSON.parse(attempt.predecessorDiagnosticsJson))
        : null,
      cancelledAt: attempt.cancelledAt,
      cancelledBy: attempt.cancelledBy,
      completedAt: attempt.completedAt,
    })),
  }
}
