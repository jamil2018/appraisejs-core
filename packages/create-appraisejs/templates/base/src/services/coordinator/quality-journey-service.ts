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
  hashQualityJourneyState,
  journeyCommandResultSchema,
  journeyCommandSchema,
  qualityJourneyRoleDefinitions,
  qualityJourneyWorkItemId,
  runnableQualityJourneyRoles,
  reconstructQualityJourneyRunner,
  submitQualityJourneyCommand,
  workerResultEnvelopeSchema,
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

async function ensureEligibleWorkItems(row: QualityJourney, db: Db) {
  const roles = runnableQualityJourneyRoles(row.stage as QualityJourneyStage, [])
  for (const role of roles) {
    const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
    const id = qualityJourneyWorkItemId(row.id, row.activeCycleId, role)
    await db.qualityJourneyWorkItem.upsert({
      where: { id },
      update: {},
      create: {
        id,
        journeyId: row.id,
        targetProjectId: row.targetProjectId,
        cycleId: row.activeCycleId,
        role,
        status: 'ELIGIBLE',
        inputHash: row.stateHash,
        roleContractDigest: hash(definition),
        allowedOutputsJson: json(definition.writableArtifacts),
        completionCriteriaJson: json([`Submit a contract-valid ${role} result envelope.`]),
      },
    })
  }
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
    const expired = await tx.qualityJourneyWorkAttempt.findMany({
      where: { workItem: { journeyId: row.id }, status: 'CLAIMED', leaseExpiresAt: { lte: now } },
    })
    for (const attempt of expired) {
      await tx.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { status: 'LEASE_EXPIRED', completedAt: now },
      })
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: attempt.workItemId, status: 'IN_PROGRESS' },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
    }
    await ensureEligibleWorkItems(row, tx)
    return { expiredAttemptIds: expired.map(item => item.id), journey: projection(row) }
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
    const attempt = item.currentAttempt + 1
    const claimed = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, version: item.version, status: item.status },
      data: { status: 'IN_PROGRESS', currentAttempt: attempt, version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new ServiceError('Quality Journey work item was claimed concurrently.', 'CONFLICT')
    const ownerToken = randomUUID()
    const leaseId = `qjl_${randomUUID()}`
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000)
    const workAttempt = await tx.qualityJourneyWorkAttempt.create({
      data: {
        id: `qja_${randomUUID()}`,
        workItemId: item.id,
        attempt,
        leaseId,
        ownerTokenHash: tokenHash(ownerToken),
        leaseExpiresAt,
        heartbeatSeconds: Math.max(10, Math.floor(leaseSeconds / 3)),
      },
    })
    return { workItem: { ...item, status: 'IN_PROGRESS', currentAttempt: attempt }, attempt: workAttempt, ownerToken }
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

function validateWorkAttempt(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt | null,
  result: WorkerResult,
) {
  if (!attempt) throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.workItemId !== item.id)
    throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.ownerTokenHash !== tokenHash(input.ownerToken))
    throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.status === 'COMPLETED') {
    if (attempt.resultHash !== hash(result))
      throw new ServiceError('Quality Journey work completion was replayed with a different result.', 'CONFLICT')
    return { replayed: true, workItemId: item.id, status: item.status }
  }
  if (attempt.leaseExpiresAt <= new Date()) throw new ServiceError('Quality Journey work lease expired.', 'CONFLICT')
  const claimedValues = [item.id, attempt.id, item.inputHash, item.role, item.roleContractDigest]
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

export async function completeQualityJourneyWork(input: WorkCompletionInput, client: PrismaClient = prisma) {
  const result = workerResultEnvelopeSchema.parse(input.result)
  return client.$transaction(async tx => {
    await readJourney(input.journeyId, input.targetProjectId, tx)
    const item = await tx.qualityJourneyWorkItem.findFirst({
      where: { id: input.workItemId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!item) throw new ServiceError('Quality Journey work item not found.', 'NOT_FOUND')
    const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: input.leaseId } })
    const replay = validateWorkAttempt(input, item, attempt, result)
    if (replay) return replay
    if (!attempt) throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
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
