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
  createQualityJourneyKernelState,
  createWorkerSpawnRequest,
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

function roleAuthority(role: QualityJourneyRole) {
  const roleDefinition = qualityJourneyRoleDefinitions.find(definition => definition.role === role)
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
): FactoryAuthorization {
  const { roleDefinition, capabilityProfile } = roleAuthority(item.role as QualityJourneyRole)
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    authorizationId,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    workItemId: item.id,
    roleDefinition: {
      role: roleDefinition.role,
      version: qualityJourneyRoleRegistryVersion,
      digest: qualityJourneyContractDigest(roleDefinition),
    },
    capabilityProfile: {
      profileId: capabilityProfile.profileId,
      version: qualityJourneyRoleRegistryVersion,
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
  const canonical = factoryAuthorization(authorization.id, journey, item)
  const bindings = [
    [authorization.authorizationHash, hash(persisted)],
    [json(persisted), json(canonical)],
    [authorization.journeyId, journey.id],
    [authorization.targetProjectId, journey.targetProjectId],
    [authorization.workItemId, item.id],
    [authorization.role, item.role],
    [authorization.roleContractDigest, item.roleContractDigest],
    [authorization.capabilityProfileId, canonical.capabilityProfile.profileId],
    [authorization.capabilityProfileHash, canonical.capabilityProfile.digest],
  ]
  if (bindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality Journey work authorization is invalid.', 'UNAUTHORIZED')
  return canonical
}

function assignmentFromAuthorization(
  authorization: FactoryAuthorization,
  item: QualityJourneyWorkItem,
  attempt: { id: string; leaseId: string; leaseExpiresAt: Date; heartbeatSeconds: number },
): AssignmentManifest {
  return {
    schemaVersion: authorization.schemaVersion,
    journeyId: authorization.journeyId,
    targetProjectId: authorization.targetProjectId,
    workItemId: authorization.workItemId,
    roleDefinition: authorization.roleDefinition,
    capabilityProfile: authorization.capabilityProfile,
    inputArtifacts: authorization.inputArtifacts,
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
  const unresolvedQuestionIds = parseArray(row.unresolvedQuestionIdsJson)
  const blockerIds = parseArray(row.blockerIdsJson)
  const activeWorkItemIds = parseArray(row.activeWorkItemIdsJson)
  const permittedCommands = createQualityJourneyKernelState({
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    activeCycleId: row.activeCycleId,
    stage: row.stage as QualityJourneyStage,
    activeRevisionIds,
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

async function createWorkAuthorization(row: QualityJourney, item: QualityJourneyWorkItem, db: Db) {
  const authorizationId = `qjwa_${createHash('sha256').update(`${row.id}:${item.id}`).digest('hex').slice(0, 24)}`
  const authorization = factoryAuthorization(authorizationId, row, item)
  await db.qualityJourneyWorkAuthorization.create({
    data: {
      id: authorizationId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      workItemId: item.id,
      role: item.role,
      roleContractDigest: item.roleContractDigest,
      capabilityProfileId: authorization.capabilityProfile.profileId,
      capabilityProfileHash: authorization.capabilityProfile.digest,
      authorizationJson: json(authorization),
      authorizationHash: hash(authorization),
    },
  })
}

async function ensureEligibleWorkItems(row: QualityJourney, db: Db) {
  const roles = runnableQualityJourneyRoles(row.stage as QualityJourneyStage, [])
  for (const role of roles) {
    const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
    const id = qualityJourneyWorkItemId(row.id, row.activeCycleId, role)
    const existingItem = await db.qualityJourneyWorkItem.findUnique({ where: { id } })
    let item = existingItem
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
    where: { journeyId: row.id, authorization: null, status: { notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] } },
  })
  for (const item of items) await createWorkAuthorization(row, item, db)
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
  const updated = await tx.qualityJourney.findUniqueOrThrow({ where: { id: row.id } })
  await ensureEligibleWorkItems(updated, tx)
  return applied.result
}

export async function submitDurableQualityJourneyCommand(value: unknown, client: PrismaClient = prisma) {
  const command = journeyCommandSchema.parse(value)
  return client.$transaction(async tx => {
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
  })
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
      await tx.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { status: 'LEASE_EXPIRED', completedAt: now },
      })
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: attempt.workItemId, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
    }
    await ensureEligibleWorkItems(row, tx)
    return { recoveredWorkItemIds, expiredAttemptIds: expired.map(item => item.id), journey: projection(row) }
  })
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
    const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({ where: { workItemId: item.id } })
    if (!authorization)
      throw new ServiceError('Quality Journey work has no issued Factory authorization.', 'UNAUTHORIZED')
    const authorizationPayload = validateFactoryAuthorization(authorization, journey, item)
    const attempt = item.currentAttempt + 1
    const claimed = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, version: item.version, status: item.status },
      data: { status: 'WORKER_REQUESTED', currentAttempt: attempt, version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new ServiceError('Quality Journey work item was claimed concurrently.', 'CONFLICT')
    const ownerToken = randomUUID()
    const leaseId = `qjl_${randomUUID()}`
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000)
    const attemptId = `qja_${randomUUID()}`
    const prior =
      item.status === 'REPLACEMENT_REQUESTED'
        ? await tx.qualityJourneyWorkAttempt.findFirst({
            where: { workItemId: item.id },
            orderBy: { attempt: 'desc' },
          })
        : null
    const heartbeatSeconds = Math.max(10, Math.floor(leaseSeconds / 3))
    const manifest = assignmentFromAuthorization(authorizationPayload, item, {
      id: attemptId,
      leaseId,
      leaseExpiresAt,
      heartbeatSeconds,
    })
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
        replacesAttemptId: prior?.id,
      },
    })
    return {
      workItem: { ...item, status: 'WORKER_REQUESTED' as const, currentAttempt: attempt },
      attempt: workAttempt,
      assignment: manifest,
      spawnRequest,
      ownerToken,
    }
  })
}

type WorkCompletionInput = {
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
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: { id: input.workItemId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!item) throw new ServiceError('Quality Journey work item not found.', 'NOT_FOUND')
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: input.leaseId } })
  return { item, attempt }
}

function validatedSpawnReceipt(input: WorkSpawnReceiptInput, attempt: QualityJourneyWorkAttempt) {
  if (!attempt.spawnRequestJson || !attempt.spawnRequestHash)
    throw new ServiceError('Quality Journey worker request was not durably issued.', 'UNAUTHORIZED')
  const spawnRequest = JSON.parse(attempt.spawnRequestJson)
  if (attempt.spawnRequestHash !== hash(spawnRequest))
    throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
  const receipt = validateWorkerSpawnReceipt(input.receipt, spawnRequest)
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

export async function recordQualityJourneyWorkerSpawnReceipt(
  input: WorkSpawnReceiptInput,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const loaded = await readWorkAttempt(input, tx)
    const { item } = loaded
    const attempt = assertLeaseAuthority(input, item, loaded.attempt)
    const { receipt, receiptHash } = validatedSpawnReceipt(input, attempt)
    const replay = replayedSpawnReceipt(item, attempt, receiptHash)
    if (replay) return replay
    assertSpawnReceiptCurrent(item, attempt)
    const recorded = await tx.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, spawnReceiptId: null, status: 'WORKER_REQUESTED' },
      data: {
        status: 'IN_PROGRESS',
        spawnReceiptId: receipt.spawnReceiptId,
        spawnReceiptJson: json(receipt),
        spawnReceiptHash: receiptHash,
      },
    })
    if (recorded.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    const started = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, version: item.version, currentAttempt: attempt.attempt, status: 'WORKER_REQUESTED' },
      data: { status: 'IN_PROGRESS', version: { increment: 1 } },
    })
    if (started.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    return { replayed: false, workItemId: item.id, status: 'IN_PROGRESS' as const }
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
  if (attempt.assignmentHash !== hash(persistedAssignment) || json(persistedAssignment) !== json(expectedAssignment))
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

export async function completeQualityJourneyWork(input: WorkCompletionInput, client: PrismaClient = prisma) {
  const result = workerResultEnvelopeSchema.parse(input.result)
  return client.$transaction(async tx => {
    const { item, attempt } = await readWorkAttempt(input, tx)
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
  })
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
