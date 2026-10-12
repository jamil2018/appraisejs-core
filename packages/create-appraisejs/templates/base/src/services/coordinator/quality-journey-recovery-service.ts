import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient, QualityJourney } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled,
  pauseOwnedQualityJourneyDiscoveryBrowserCleanup,
} from './quality-journey-discovery-browser-service'
import {
  cancelQualityJourneyExecutionRuntime,
  reconcileSealedQualityJourneyExecutionRuntimeInTransaction,
} from './quality-journey-runtime-service'
import { assertQualityJourneyRecoverable } from './quality-journey-terminal'

type Scope = { journeyId: string; targetProjectId: string }
type CleanupTargets = { browserSessionIds: string[]; executionCycleIds: string[] }
type OperationalInput = Scope & {
  expectedStateHash: string
  expectedVersion: number
  idempotencyKey: string
}
export type PauseQualityJourneyInput = OperationalInput & { reason: string }
export type ResumeQualityJourneyInput = OperationalInput

const json = (value: unknown) => canonicalContractJson(value)
const digest = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const stableEventId = (operation: 'PAUSE' | 'RESUME', input: OperationalInput) =>
  `qje_${createHash('sha256').update(`${input.journeyId}:${operation}:${input.idempotencyKey}`).digest('hex').slice(0, 24)}`
const conflict = (message: string) => new ServiceError(message, 'CONFLICT', 409)

async function scopedJourney(input: Scope, tx: Prisma.TransactionClient) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  return journey
}

type CleanupObservation = Awaited<ReturnType<typeof cleanupOwnedWork>>

function parseCleanupTargets(payload: { cleanupTargets?: unknown }): CleanupTargets {
  const targets = payload.cleanupTargets
  if (!targets || typeof targets !== 'object') throw conflict('Operational pause cleanup targets are unavailable.')
  const { browserSessionIds, executionCycleIds } = targets as Partial<CleanupTargets>
  if (
    !Array.isArray(browserSessionIds) ||
    !browserSessionIds.every(id => typeof id === 'string') ||
    !Array.isArray(executionCycleIds) ||
    !executionCycleIds.every(id => typeof id === 'string')
  )
    throw conflict('Operational pause cleanup targets are invalid.')
  return { browserSessionIds, executionCycleIds }
}

async function captureCleanupTargets(scope: Scope, tx: Prisma.TransactionClient): Promise<CleanupTargets> {
  const [browsers, cycles] = await Promise.all([
    tx.qualityJourneyOwnedBrowser.findMany({
      where: {
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        status: { in: ['LAUNCHING', 'LIVE', 'STOP_REQUESTED', 'UNKNOWN'] },
      },
      select: { sessionId: true },
    }),
    tx.qualityJourneyExecutionCycle.findMany({
      where: {
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        status: { in: ['RESERVED', 'RUNNING', 'CANCELLING'] },
      },
      select: { id: true },
    }),
  ])
  return {
    browserSessionIds: browsers.map(row => row.sessionId).sort(),
    executionCycleIds: cycles.map(row => row.id).sort(),
  }
}

function parseCleanupObservation(payloadJson: string, pauseEventId: string): CleanupObservation | null {
  const payload = JSON.parse(payloadJson) as {
    pauseEventId: string
    observationHash: string
    cleanup: CleanupObservation
  }
  if (payload.pauseEventId !== pauseEventId) return null
  if (payload.observationHash !== digest(payload.cleanup))
    throw conflict('Operational cleanup observation lineage is invalid.')
  return payload.cleanup
}

async function latestPauseCleanup(scope: Scope, tx: Prisma.TransactionClient | PrismaClient) {
  const pause = await tx.qualityJourneyEvent.findFirst({
    where: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, eventType: 'OPERATIONAL_PAUSE' },
    orderBy: { sequence: 'desc' },
    select: { id: true },
  })
  if (!pause) return null
  const observations = await tx.qualityJourneyEvent.findMany({
    where: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      eventType: 'OPERATIONAL_PAUSE_CLEANUP',
    },
    orderBy: { sequence: 'desc' },
    select: { payloadJson: true },
  })
  let latest: CleanupObservation | null = null
  for (const observation of observations) {
    const cleanup = parseCleanupObservation(observation.payloadJson, pause.id)
    if (!cleanup) continue
    latest = latest ?? cleanup
  }
  return latest
}

async function replayOperationalTransition(
  operation: 'PAUSE' | 'RESUME',
  journey: QualityJourney,
  eventId: string,
  requestHash: string,
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyEvent.findUnique({ where: { id: eventId } })
  if (!existing) return null
  const payload = JSON.parse(existing.payloadJson) as {
    requestHash?: string
    version?: number
    cleanupTargets?: unknown
  }
  if (existing.eventType !== `OPERATIONAL_${operation}` || payload.requestHash !== requestHash)
    throw conflict('Operational idempotency key was reused with different input.')
  const latestOperational = await tx.qualityJourneyEvent.findFirst({
    where: { journeyId: journey.id, eventType: { in: ['OPERATIONAL_PAUSE', 'OPERATIONAL_RESUME'] } },
    orderBy: { sequence: 'desc' },
    select: { id: true },
  })
  return {
    replayed: true,
    journey,
    eventId,
    recordedVersion: payload.version ?? journey.version,
    currentOperationalReceipt: latestOperational?.id === eventId,
    cleanupTargets: operation === 'PAUSE' ? parseCleanupTargets(payload) : null,
  }
}

async function assertResumeReady(input: OperationalInput, tx: Prisma.TransactionClient) {
  const cleanup = await latestPauseCleanup(input, tx)
  if (!cleanup || cleanup.browser === 'UNKNOWN')
    throw conflict('Owned Discovery browser cleanup has no confirmed pause observation.')
  await assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    tx,
  )
  const [unsettled, nonterminalRun, ambiguousManaged] = await Promise.all([
    tx.qualityJourneyExecutionCycle.count({
      where: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    }),
    tx.qualityJourneyExecutionTestRun.count({
      where: {
        executionCycle: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        testRun: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      },
    }),
    tx.qualityJourneyWorkAttempt.count({
      where: {
        workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        executionMode: { not: 'EXTERNAL_V1' },
        status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS', 'DISPATCH_UNRESOLVED'] },
        OR: [{ dispatchReservedAt: { not: null } }, { dispatchStartedAt: { not: null } }],
      },
    }),
  ])
  if (unsettled || nonterminalRun || ambiguousManaged)
    throw conflict('Owned execution or ambiguous managed dispatch still needs reconciliation before resume.')
}

async function appendOperationalEvent(
  operation: 'PAUSE' | 'RESUME',
  input: PauseQualityJourneyInput | ResumeQualityJourneyInput,
  journey: QualityJourney,
  eventId: string,
  requestHash: string,
  to: string,
  tx: Prisma.TransactionClient,
  cleanupTargets: CleanupTargets | null,
) {
  const sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1
  await tx.qualityJourneyEvent.create({
    data: {
      id: eventId,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      sequence,
      eventType: `OPERATIONAL_${operation}`,
      commandId: null,
      predecessorStateHash: journey.stateHash,
      successorStateHash: journey.stateHash,
      payloadJson: json({
        operation,
        requestHash,
        version: journey.version + 1,
        status: to,
        ...(operation === 'PAUSE'
          ? { reasonHash: digest((input as PauseQualityJourneyInput).reason), cleanupTargets }
          : {}),
      }),
    },
  })
}

async function assertTransitionPrerequisites(
  operation: 'PAUSE' | 'RESUME',
  input: OperationalInput,
  journey: QualityJourney,
  tx: Prisma.TransactionClient,
) {
  assertQualityJourneyRecoverable(journey)
  const from = operation === 'PAUSE' ? 'ACTIVE' : 'PAUSED'
  const to = operation === 'PAUSE' ? 'PAUSED' : 'ACTIVE'
  if (journey.status !== from) throw conflict(`Quality Journey must be ${from} to ${operation.toLowerCase()}.`)
  if (journey.stateHash !== input.expectedStateHash || journey.version !== input.expectedVersion)
    throw conflict('Quality Journey changed. Re-read its current version before retrying.')
  // SQLite serializes the later read/write transaction against concurrent admissions.
  if (operation === 'RESUME') await assertResumeReady(input, tx)
  return { from, to }
}

async function publishSealedCyclesBeforeResumeCommit(scope: Scope, tx: Prisma.TransactionClient) {
  const cycles = await tx.qualityJourneyExecutionCycle.findMany({
    where: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      status: { in: ['COMPLETED', 'CANCELLED'] },
    },
    select: { id: true },
    orderBy: { startedAt: 'asc' },
  })
  for (const cycle of cycles) {
    if (!(await reconcileSealedQualityJourneyExecutionRuntimeInTransaction(cycle.id, tx)))
      throw conflict('Sealed execution evidence is incomplete; keep the Journey paused for reconciliation.')
  }
}

async function transition(
  operation: 'PAUSE' | 'RESUME',
  input: PauseQualityJourneyInput | ResumeQualityJourneyInput,
  client: PrismaClient,
) {
  const eventId = stableEventId(operation, input)
  const requestHash = digest({ operation, ...input })
  return client.$transaction(async tx => {
    const journey = await scopedJourney(input, tx)
    const replay = await replayOperationalTransition(operation, journey, eventId, requestHash, tx)
    if (replay) return replay
    const { from, to } = await assertTransitionPrerequisites(operation, input, journey, tx)

    const changed = await tx.qualityJourney.updateMany({
      where: {
        id: journey.id,
        targetProjectId: input.targetProjectId,
        status: from,
        version: input.expectedVersion,
        stateHash: input.expectedStateHash,
      },
      data: { status: to, version: { increment: 1 } },
    })
    if (changed.count !== 1) throw conflict('Quality Journey operational status changed concurrently.')
    if (operation === 'PAUSE') await fenceExternalWork(input, tx)
    const cleanupTargets = operation === 'PAUSE' ? await captureCleanupTargets(input, tx) : null
    await appendOperationalEvent(operation, input, journey, eventId, requestHash, to, tx, cleanupTargets)
    if (operation === 'RESUME') await publishSealedCyclesBeforeResumeCommit(input, tx)
    const latestJourney = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journey.id } })
    return {
      replayed: false,
      journey: latestJourney,
      eventId,
      recordedVersion: journey.version + 1,
      currentOperationalReceipt: true,
      cleanupTargets,
    }
  })
}

async function fenceExternalWork(input: Scope, tx: Prisma.TransactionClient) {
  const now = new Date()
  await tx.qualityJourneyWorkAttempt.updateMany({
    where: {
      workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
      executionMode: 'EXTERNAL_V1',
      status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUSED', 'LEASE_EXPIRED'] },
    },
    data: {
      status: 'EXPIRED',
      completedAt: now,
      cancelledAt: now,
      cancelledBy: 'OPERATIONAL_PAUSE',
      cancellationReason: 'Journey operational pause fenced this external assignment.',
    },
  })
  const replaceable = await tx.qualityJourneyWorkItem.findMany({
    where: {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      status: {
        in: ['ELIGIBLE', 'WORK_ITEM_ISSUED', 'WORKER_REQUESTED', 'WORKER_STARTED', 'IN_PROGRESS', 'LEASE_EXPIRED'],
      },
      OR: [
        { attempts: { some: { executionMode: 'EXTERNAL_V1', status: 'EXPIRED', cancelledBy: 'OPERATIONAL_PAUSE' } } },
        { attempts: { none: {} } },
      ],
    },
    select: { id: true },
  })
  await tx.qualityJourneyWorkItem.updateMany({
    where: { id: { in: replaceable.map(item => item.id) } },
    data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
  })
}

async function cleanupOwnedBrowser(input: Scope, targets: CleanupTargets, client: PrismaClient) {
  try {
    const result = await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(
      { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
      client,
      targets.browserSessionIds,
    )
    const browserReceipts = result.receipts.map(receipt => ({
      sessionId: receipt.sessionId,
      processInstanceId: receipt.processInstanceId,
      state: receipt.state,
    }))
    const browserReceiptHashes = browserReceipts.map(receipt => digest(receipt)).sort()
    const browser =
      result.state === 'NONE_REGISTERED'
        ? 'NONE_REGISTERED'
        : result.receipts.length > 0 && result.receipts.every(receipt => receipt.state === 'RUNTIME_CLOSE_CONFIRMED')
          ? 'OBSERVED'
          : 'UNKNOWN'
    return { browser, browserReceipts, browserReceiptHashes }
  } catch {
    // The durable pause is still effective. A later same-key retry reattempts cleanup.
    return { browser: 'UNKNOWN' as const, browserReceipts: [], browserReceiptHashes: [] }
  }
}

async function observeExecutionCleanup(input: Scope, cycleIds: string[], failed: boolean, client: PrismaClient) {
  const [statuses, bindings, unfinished, nonterminalRuns] = await Promise.all([
    client.qualityJourneyExecutionCycle.findMany({
      where: { id: { in: cycleIds } },
      select: { id: true, status: true },
    }),
    client.qualityJourneyExecutionTestRun.findMany({
      where: { executionCycleId: { in: cycleIds } },
      select: {
        testRunId: true,
        testRun: { select: { status: true, runtimeCapsuleExecutionAttempt: { select: { stopReceiptHash: true } } } },
      },
    }),
    client.qualityJourneyExecutionCycle.count({
      where: {
        id: { in: cycleIds },
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    }),
    client.qualityJourneyExecutionTestRun.count({
      where: {
        executionCycleId: { in: cycleIds },
        executionCycle: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        testRun: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      },
    }),
  ])
  const executionRunReceipts = bindings
    .map(binding => ({
      testRunId: binding.testRunId,
      status: binding.testRun.status,
      stopReceiptHash: binding.testRun.runtimeCapsuleExecutionAttempt?.stopReceiptHash ?? null,
    }))
    .sort((left, right) => left.testRunId.localeCompare(right.testRunId))
  return {
    execution:
      failed || statuses.length !== cycleIds.length
        ? ('UNKNOWN' as const)
        : unfinished || nonterminalRuns
          ? ('REQUESTED' as const)
          : ('OBSERVED' as const),
    executionCycleStatusHashes: statuses.map(status => digest(status)).sort(),
    executionRunReceipts,
  }
}

async function cleanupOwnedExecution(input: Scope, targets: CleanupTargets, client: PrismaClient) {
  try {
    if (targets.executionCycleIds.length === 0)
      return { execution: 'NONE_REGISTERED' as const, executionCycleStatusHashes: [], executionRunReceipts: [] }
    const cycles = await client.qualityJourneyExecutionCycle.findMany({
      where: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        id: { in: targets.executionCycleIds },
        status: { in: ['RESERVED', 'RUNNING', 'CANCELLING'] },
      },
      select: { id: true },
    })
    const results = await Promise.allSettled(
      cycles.map(cycle =>
        cancelQualityJourneyExecutionRuntime(
          { executionCycleId: cycle.id, reason: 'Quality Journey operational pause' },
          client,
        ),
      ),
    )
    return observeExecutionCleanup(
      input,
      targets.executionCycleIds,
      results.some(result => result.status === 'rejected'),
      client,
    )
  } catch {
    // Unknown is intentionally visible until reconciliation proves a terminal result.
    return { execution: 'UNKNOWN' as const, executionCycleStatusHashes: [], executionRunReceipts: [] }
  }
}

async function cleanupOwnedWork(input: Scope, targets: CleanupTargets, client: PrismaClient) {
  const browser = await cleanupOwnedBrowser(input, targets, client)
  const execution = await cleanupOwnedExecution(input, targets, client)
  return {
    ...browser,
    ...execution,
    externalCodex: 'UNKNOWN' as const,
  }
}

async function recordCleanupObservation(
  scope: Scope,
  pauseEventId: string,
  cleanup: Awaited<ReturnType<typeof cleanupOwnedWork>>,
  client: PrismaClient,
) {
  const observationHash = digest(cleanup)
  const id = `qje_${createHash('sha256').update(`${pauseEventId}:${observationHash}`).digest('hex').slice(0, 24)}`
  await client.$transaction(async tx => {
    if (await tx.qualityJourneyEvent.findUnique({ where: { id } })) return
    const journey = await tx.qualityJourney.findFirst({
      where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    })
    if (!journey || journey.status !== 'PAUSED') return
    const latestOperational = await tx.qualityJourneyEvent.findFirst({
      where: { journeyId: journey.id, eventType: { in: ['OPERATIONAL_PAUSE', 'OPERATIONAL_RESUME'] } },
      orderBy: { sequence: 'desc' },
      select: { id: true },
    })
    if (latestOperational?.id !== pauseEventId) return
    const sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1
    await tx.qualityJourneyEvent.create({
      data: {
        id,
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        sequence,
        eventType: 'OPERATIONAL_PAUSE_CLEANUP',
        commandId: null,
        predecessorStateHash: journey.stateHash,
        successorStateHash: journey.stateHash,
        payloadJson: json({ pauseEventId, observationHash, cleanup }),
      },
    })
  })
}

async function retryCurrentPauseCleanupForResume(input: ResumeQualityJourneyInput, client: PrismaClient) {
  const pause = await client.$transaction(async tx => {
    const journey = await scopedJourney(input, tx)
    // Exact prior resume replay must not touch work admitted after that resume.
    const priorResume = await tx.qualityJourneyEvent.findUnique({ where: { id: stableEventId('RESUME', input) } })
    if (priorResume) return null
    assertQualityJourneyRecoverable(journey)
    if (journey.status !== 'PAUSED') throw conflict('Quality Journey must be PAUSED to resume.')
    if (journey.stateHash !== input.expectedStateHash || journey.version !== input.expectedVersion)
      throw conflict('Quality Journey changed. Re-read its current version before retrying.')
    const fenced = await tx.qualityJourney.updateMany({
      where: {
        id: journey.id,
        targetProjectId: input.targetProjectId,
        status: 'PAUSED',
        version: input.expectedVersion,
        stateHash: input.expectedStateHash,
      },
      data: { status: 'PAUSED', updatedAt: journey.updatedAt },
    })
    if (fenced.count !== 1) throw conflict('Quality Journey operational status changed concurrently.')
    const latestOperational = await tx.qualityJourneyEvent.findFirst({
      where: { journeyId: journey.id, eventType: { in: ['OPERATIONAL_PAUSE', 'OPERATIONAL_RESUME'] } },
      orderBy: { sequence: 'desc' },
      select: { id: true, eventType: true, payloadJson: true },
    })
    if (latestOperational?.eventType !== 'OPERATIONAL_PAUSE')
      throw conflict('The current pause receipt is unavailable for cleanup reconciliation.')
    return {
      eventId: latestOperational.id,
      targets: parseCleanupTargets(JSON.parse(latestOperational.payloadJson) as { cleanupTargets?: unknown }),
    }
  })
  if (!pause) return
  const cleanup = await cleanupOwnedWork(input, pause.targets, client)
  await recordCleanupObservation(input, pause.eventId, cleanup, client)
}

export async function pauseQualityJourneyOperational(input: PauseQualityJourneyInput, client: PrismaClient = prisma) {
  const transitionResult = await transition('PAUSE', input, client)
  const cleanup =
    transitionResult.journey.status === 'PAUSED' && transitionResult.currentOperationalReceipt
      ? await cleanupOwnedWork(input, transitionResult.cleanupTargets!, client)
      : {
          browser: 'UNKNOWN' as const,
          execution: 'UNKNOWN' as const,
          externalCodex: 'UNKNOWN' as const,
          browserReceipts: [],
          browserReceiptHashes: [],
          executionCycleStatusHashes: [],
          executionRunReceipts: [],
        }
  if (transitionResult.journey.status === 'PAUSED' && transitionResult.currentOperationalReceipt)
    await recordCleanupObservation(input, transitionResult.eventId, cleanup, client)
  return {
    journeyId: input.journeyId,
    operationalStatus: transitionResult.journey.status,
    version: transitionResult.journey.version,
    stateHash: transitionResult.journey.stateHash,
    replayed: transitionResult.replayed,
    eventId: transitionResult.eventId,
    cleanup,
  }
}

export async function resumeQualityJourneyOperational(input: ResumeQualityJourneyInput, client: PrismaClient = prisma) {
  await retryCurrentPauseCleanupForResume(input, client)
  const transitionResult = await transition('RESUME', input, client)
  return {
    journeyId: input.journeyId,
    operationalStatus: transitionResult.journey.status,
    version: transitionResult.journey.version,
    stateHash: transitionResult.journey.stateHash,
    replayed: transitionResult.replayed,
    eventId: transitionResult.eventId,
    cleanup:
      transitionResult.currentOperationalReceipt && transitionResult.journey.status === 'ACTIVE'
        ? ((await latestPauseCleanup(input, client)) ?? {
            browser: 'UNKNOWN',
            execution: 'UNKNOWN',
            externalCodex: 'UNKNOWN',
          })
        : { browser: 'UNKNOWN', execution: 'UNKNOWN', externalCodex: 'UNKNOWN' },
  }
}
