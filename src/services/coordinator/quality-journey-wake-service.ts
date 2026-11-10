import { readAnalysisFollowupAttemptBudget } from './quality-journey-analysis-followup-budget'
import { createHash, randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  QualityJourney,
  QualityJourneyWakeIntent,
  QualityJourneyProviderRun,
} from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  selectAnalysisFollowupIssuance,
  analysisFollowupIssuancePayloadsForAuthorization,
  assertAnalysisFollowupAttemptBudget,
  type AnalysisFollowupExpectedWork,
} from './quality-journey-analysis-followup'
import {
  assertCoordinatorAttemptSession,
  assertCoordinatorRecoverySession,
  assertCurrentCoordinatorSession,
  type CoordinatorSessionBinding,
} from './quality-journey-coordinator-session'

/** In-process producer authority; never accepted from a coordinator/model payload. */
export const trustedQualityJourneyWakeProducer: unique symbol = Symbol('trusted canonical Journey wake producer')
type QualityJourneyWakeReason =
  | 'INITIAL_PROVIDER_RUN'
  | 'CANONICAL_TRANSITION'
  | 'RECOVERY_REQUIRED'
  | 'STATE_CHANGED'
  | 'WORK_CHANGED'
  | 'AUTHORIZATION_CHANGED'
  | 'JOURNEY_EVENT'
  | 'PROVIDER_INTENT_PREPARED'
type WakeScope = CoordinatorSessionBinding
type WakeCause = Pick<WakeScope, 'journeyId' | 'targetProjectId'> & {
  causeKey: string
  reason: QualityJourneyWakeReason
  highWaterSequence?: number
}
type WakeClaim = WakeScope & { wakeId: string; claimOwner: string }
type Clock = () => Date
const leaseMilliseconds = 120_000
const pageSize = 100
const reasons = new Set<QualityJourneyWakeReason>([
  'INITIAL_PROVIDER_RUN',
  'CANONICAL_TRANSITION',
  'RECOVERY_REQUIRED',
  'STATE_CHANGED',
  'WORK_CHANGED',
  'AUTHORIZATION_CHANGED',
  'JOURNEY_EVENT',
  'PROVIDER_INTENT_PREPARED',
])
const conflict = () => new ServiceError('Quality Journey wake claim is stale or unavailable.', 'CONFLICT')

function assertMachineKey(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,300}$/.test(value))
    throw new ServiceError('Quality Journey wake machine key is invalid.', 'VALIDATION')
}

/** Call inside the canonical mutation transaction. No raw event/provider data is stored. */
export async function enqueueQualityJourneyWakeInTransaction(
  input: WakeCause,
  tx: Prisma.TransactionClient,
  capability: typeof trustedQualityJourneyWakeProducer,
) {
  if (capability !== trustedQualityJourneyWakeProducer)
    throw new ServiceError('Canonical wake producer authority is required.', 'UNAUTHORIZED')
  assertMachineKey(input.causeKey)
  if (!reasons.has(input.reason)) throw new ServiceError('Quality Journey wake reason is invalid.', 'VALIDATION')
  if (
    input.highWaterSequence !== undefined &&
    (!Number.isSafeInteger(input.highWaterSequence) ||
      input.highWaterSequence < 0 ||
      input.highWaterSequence > 2_147_483_647)
  )
    throw new ServiceError('Quality Journey wake sequence is invalid.', 'VALIDATION')
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND')
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1') return null
  const key = { journeyId: input.journeyId, targetProjectId: input.targetProjectId, causeKey: input.causeKey }
  const existing = await tx.qualityJourneyWakeIntent.findUnique({
    where: { journeyId_targetProjectId_causeKey: key },
  })
  if (existing) {
    // All immutable cause fields form the request digest; no caller payload is retained.
    if (existing.reason !== input.reason || existing.highWaterSequence !== (input.highWaterSequence ?? null))
      throw new ServiceError('Quality Journey wake cause was reused with different input.', 'CONFLICT')
    return existing
  }
  return tx.qualityJourneyWakeIntent.create({
    data: { id: `qjw_${randomUUID()}`, ...key, reason: input.reason, highWaterSequence: input.highWaterSequence },
  })
}

async function assertManagedScope(input: WakeScope, tx: Prisma.TransactionClient, write: boolean) {
  const current = await assertCurrentCoordinatorSession(input, tx)
  if (current.journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || !current.session)
    throw new ServiceError('Managed coordinator session authority is required for wake processing.', 'UNAUTHORIZED')
  // Recovery remains possible during pause/cancel; this does not authorize new work.
  if (write) await assertCoordinatorRecoverySession(input, input, tx)
  return current.journey
}

type AdmittedAttempt = Prisma.QualityJourneyWorkAttemptGetPayload<{
  include: {
    workItem: true
    providerRun: true
    authorization: { include: { successorAuthorization: { select: { id: true } } } }
  }
}>

function authorizationMatchesWork(attempt: AdmittedAttempt, journey: QualityJourney) {
  const authorization = attempt.authorization
  return (
    authorization &&
    authorization.journeyId === journey.id &&
    authorization.targetProjectId === journey.targetProjectId &&
    authorization.workItemId === attempt.workItemId &&
    authorization.role === attempt.workItem.role &&
    authorization.roleContractDigest === attempt.workItem.roleContractDigest
  )
}

function hasCurrentWakeAuthorization(attempt: AdmittedAttempt, journey: QualityJourney, input: WakeScope) {
  const authorization = attempt.authorization
  if (!authorizationMatchesWork(attempt, journey) || !authorization) return false
  if (authorization.revokedAt || authorization.cancelledAt || authorization.successorAuthorization) return false
  return equalPairs([
    [attempt.attempt, attempt.workItem.currentAttempt],
    [authorization.externalPrincipalId, input.coordinatorPrincipalId],
    [attempt.externalPrincipalId, input.coordinatorPrincipalId],
    [authorization.externalAdmissionProtocol, 'EXTERNAL_V1'],
    [authorization.externalPrincipalAssurance, 'PROJECT_CREDENTIAL_ONLY'],
    [attempt.externalPrincipalAssurance, 'PROJECT_CREDENTIAL_ONLY'],
    [attempt.executionMode, 'EXTERNAL_V1'],
  ])
}

async function hasCurrentAttemptSession(attemptId: string, input: WakeScope, tx: Prisma.TransactionClient) {
  // A wake grants no assignment ownership: preserve the immutable session fence.
  try {
    await assertCoordinatorAttemptSession({ ...input, attemptId }, tx)
    return true
  } catch (error) {
    if (error instanceof ServiceError && ['UNAUTHORIZED', 'CONFLICT'].includes(error.code)) return false
    throw error
  }
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const equalPairs = (pairs: [unknown, unknown][]) => pairs.every(([left, right]) => left === right)

function runMatchesAssignment(run: QualityJourneyProviderRun, attempt: AdmittedAttempt) {
  return equalPairs([
    [run.attemptId, attempt.id],
    [run.workItemId, attempt.workItemId],
    [run.role, attempt.workItem.role],
    [run.assignmentId, attempt.assignmentId],
    [run.assignmentGeneration, attempt.assignmentGeneration],
    [run.assignmentHash, attempt.assignmentHash],
    [run.leaseId, attempt.leaseId],
    [run.admissionId, attempt.externalAdmissionId],
    [run.admissionHash, attempt.externalAdmissionHash],
    [run.authorizationId, attempt.authorizationId],
    [run.authorizationHash, attempt.authorization?.authorizationHash],
  ])
}

function runMatchesCurrentScope(run: QualityJourneyProviderRun, journey: QualityJourney, input: WakeScope) {
  return equalPairs([
    [run.journeyId, journey.id],
    [run.targetProjectId, journey.targetProjectId],
    [run.sessionId, input.coordinatorSessionId],
    [run.coordinatorGeneration, input.coordinatorGeneration],
    [run.principalId, input.coordinatorPrincipalId],
  ])
}

function runMatchesCurrentInput(run: QualityJourneyProviderRun, attempt: AdmittedAttempt, journey: QualityJourney) {
  const revision = {
    revisions: journey.activeRevisionIdsJson,
    cycleId: journey.activeCycleId,
    roleContractDigest: attempt.workItem.roleContractDigest,
  }
  return equalPairs([
    [run.inputHash, attempt.workItem.inputHash],
    [run.scopeHash, digest(attempt.workItem.authorizationScopeJson)],
    [run.revisionHash, digest(revision)],
  ])
}

function journeyAllowsWork(journey: QualityJourney) {
  return (
    journey.status === 'ACTIVE' &&
    journey.stage !== 'CLOSED' &&
    JSON.parse(journey.unresolvedQuestionIdsJson).length === 0 &&
    JSON.parse(journey.blockerIdsJson).length === 0
  )
}

async function pendingUnarmedIntents(runIds: string[], tx: Prisma.TransactionClient, now: Date) {
  const intents = await tx.qualityJourneyProviderDispatchIntent.findMany({
    where: {
      providerRunId: { in: runIds },
      sendBoundaryId: null,
      armedAt: null,
      invalidatedAt: null,
      reconciledAt: null,
      OR: [{ status: 'PENDING' }, { status: 'CLAIMED', claimExpiresAt: { lte: now } }],
      run: { status: 'PREPARED', terminalReconciledAt: null, unresolvedRetentionAt: { gt: now } },
    },
    include: { run: { select: { attemptId: true, workItemId: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: pageSize,
  })
  return intents.map(intent => ({
    intentId: intent.id,
    attemptId: intent.run.attemptId,
    workItemId: intent.run.workItemId,
  }))
}

async function eligibleWorkHints(
  attempts: AdmittedAttempt[],
  journey: QualityJourney,
  input: WakeScope,
  tx: Prisma.TransactionClient,
  now: Date,
) {
  const admittedWithoutRun: { attemptId: string; workItemId: string }[] = []
  const runIds: string[] = []
  for (const attempt of attempts) {
    if (!hasCurrentWakeAuthorization(attempt, journey, input)) continue
    if (!(await hasCurrentAttemptSession(attempt.id, input, tx))) continue
    const run = attempt.providerRun
    if (!run) {
      admittedWithoutRun.push({ attemptId: attempt.id, workItemId: attempt.workItemId })
      continue
    }
    if (!runMatchesAssignment(run, attempt)) continue
    if (!runMatchesCurrentScope(run, journey, input)) continue
    if (runMatchesCurrentInput(run, attempt, journey)) runIds.push(run.id)
  }
  return { admittedWithoutRun, pendingProviderIntents: await pendingUnarmedIntents(runIds, tx, now) }
}

async function canonicalWork(input: WakeScope, tx: Prisma.TransactionClient, now: Date) {
  const journey = await assertManagedScope(input, tx, false)
  const latest = await tx.qualityJourneyEvent.findFirst({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  const highWaterSequence = latest?.sequence ?? 0
  if (!journeyAllowsWork(journey))
    return {
      highWaterSequence,
      admittedWithoutRun: [],
      pendingProviderIntents: [],
      analysisFollowups: [],
      analysisFollowupBlocks: [],
      outcome: 'RECONCILIATION_REQUIRED' as const,
    }
  const attempts = await tx.qualityJourneyWorkAttempt.findMany({
    where: {
      status: 'IN_PROGRESS',
      externalAdmissionId: { not: null },
      leaseExpiresAt: { gt: now },
      cancelledAt: null,
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        status: 'IN_PROGRESS',
        cycleId: journey.activeCycleId,
      },
    },
    include: {
      workItem: true,
      providerRun: true,
      authorization: { include: { successorAuthorization: { select: { id: true } } } },
    },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    take: pageSize,
  })
  const hints = await eligibleWorkHints(attempts, journey, input, tx, now)
  const { hints: analysisFollowups, blocks: analysisFollowupBlocks } = await currentAnalysisFollowupHints(
    journey,
    input,
    tx,
    now,
  )
  return {
    highWaterSequence,
    ...hints,
    analysisFollowups,
    analysisFollowupBlocks,
    outcome:
      hints.admittedWithoutRun.length + hints.pendingProviderIntents.length + analysisFollowups.length
        ? ('ADMITTED_WORK_DISCOVERED' as const)
        : ('CANONICAL_STATE_OBSERVED' as const),
  }
}

/** Persisted issuance/assignment hints only. The scheduler revalidates the full current snapshot. */
type AnalysisWakeItem = Prisma.QualityJourneyWorkItemGetPayload<{ include: { authorizations: true; attempts: true } }>
async function hasCurrentAnalysisWakeAttempt(
  item: AnalysisWakeItem,
  authorizationId: string,
  input: WakeScope,
  tx: Prisma.TransactionClient,
  now: Date,
) {
  if (item.status === 'ELIGIBLE') return true
  const attempt = item.attempts[0]
  if (
    !attempt ||
    attempt.attempt !== item.currentAttempt ||
    attempt.authorizationId !== authorizationId ||
    attempt.executionMode !== 'EXTERNAL_V1' ||
    attempt.externalPrincipalId !== input.coordinatorPrincipalId ||
    attempt.leaseExpiresAt <= now ||
    attempt.cancelledAt
  )
    return false
  return hasCurrentAttemptSession(attempt.id, input, tx)
}

type AnalysisFollowupWakeHint = {
  expected: AnalysisFollowupExpectedWork
  workStatus: string
  observedWorkItemVersion: number
  attemptId: string | null
  phase: 'ELIGIBLE' | 'CLAIMED' | 'ADMITTED'
}
async function hasAnalysisFollowupWakeBudget(
  item: AnalysisWakeItem,
  authorization: AnalysisWakeItem['authorizations'][number],
  tx: Prisma.TransactionClient,
) {
  const budget = await readAnalysisFollowupAttemptBudget(item, authorization, tx)
  try {
    assertAnalysisFollowupAttemptBudget(budget)
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error
    return false
  }
  return true
}

function projectAnalysisFollowupWakeHint(
  item: AnalysisWakeItem,
  authorizationId: string,
  issued: ReturnType<typeof selectAnalysisFollowupIssuance>,
  attempt: AnalysisWakeItem['attempts'][number] | undefined,
): AnalysisFollowupWakeHint {
  return {
    expected: {
      workItemId: item.id,
      cycleId: item.cycleId,
      version: issued.issuance.issuedWorkItemVersion,
      inputHash: item.inputHash,
      authorizationId: authorizationId,
      causeHash: issued.causeHash,
    },
    workStatus: item.status,
    observedWorkItemVersion: item.version,
    attemptId: item.status === 'ELIGIBLE' ? null : attempt!.id,
    phase: item.status === 'ELIGIBLE' ? 'ELIGIBLE' : item.status === 'WORKER_REQUESTED' ? 'CLAIMED' : 'ADMITTED',
  }
}

/** An initial or unrecorded assignment cannot be promoted by wake discovery. */
function readRecordedAnalysisWakeAuthorization(item: AnalysisWakeItem, payloads: unknown[]) {
  if (item.authorizations.length !== 1) return null
  const authorization = item.authorizations[0]!
  if (authorization.revokedAt || authorization.cancelledAt) return null
  // Initial/legacy work has no compiler event and is outside this hint family.
  if (!analysisFollowupIssuancePayloadsForAuthorization(payloads, authorization.id).length) return null
  return authorization
}

async function readAnalysisFollowupWakeHint(
  item: AnalysisWakeItem,
  journey: QualityJourney,
  input: WakeScope,
  payloads: unknown[],
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<AnalysisFollowupWakeHint | 'AUTHORITY_BLOCKED' | null> {
  const authorization = readRecordedAnalysisWakeAuthorization(item, payloads)
  if (!authorization) return null
  if (item.status === 'ELIGIBLE' && !(await hasAnalysisFollowupWakeBudget(item, authorization, tx)))
    return 'AUTHORITY_BLOCKED'
  const issued = selectAnalysisFollowupIssuance(payloads, {
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    workItemId: item.id,
    authorizationId: authorization.id,
  })
  if (
    issued.inputHash !== item.inputHash ||
    issued.descriptor.cycleId !== journey.activeCycleId ||
    issued.descriptor.roleContractDigest !== item.roleContractDigest
  )
    return null
  const attempt = item.attempts[0]
  if (!(await hasCurrentAnalysisWakeAttempt(item, authorization.id, input, tx, now))) return null
  return projectAnalysisFollowupWakeHint(item, authorization.id, issued, attempt)
}

async function currentAnalysisFollowupHints(
  journey: QualityJourney,
  input: WakeScope,
  tx: Prisma.TransactionClient,
  now: Date,
) {
  if (journey.stage !== 'ANALYSIS') return { hints: [], blocks: [] }
  const items = await tx.qualityJourneyWorkItem.findMany({
    where: {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      cycleId: journey.activeCycleId,
      role: 'REQUIREMENT_ANALYZER',
      status: { in: ['ELIGIBLE', 'WORKER_REQUESTED', 'IN_PROGRESS'] },
    },
    include: {
      authorizations: { where: { successorAuthorization: { is: null } } },
      attempts: { orderBy: { attempt: 'desc' }, take: 1 },
    },
    take: pageSize,
  })
  const events = await tx.qualityJourneyEvent.findMany({
    where: { journeyId: journey.id, targetProjectId: journey.targetProjectId, eventType: 'ANALYSIS_FOLLOWUP_ISSUED' },
  })
  const payloads: unknown[] = events.map(event => JSON.parse(event.payloadJson))
  const hints: AnalysisFollowupWakeHint[] = []
  const blocks: { workItemId: string; reason: 'AUTHORITY_BLOCKED' }[] = []
  for (const item of items) {
    const hint = await readAnalysisFollowupWakeHint(item, journey, input, payloads, tx, now)
    if (hint === 'AUTHORITY_BLOCKED') blocks.push({ workItemId: item.id, reason: hint })
    else if (hint) hints.push(hint)
  }
  return { hints, blocks }
}

/** Poll on startup and after notifications. Results are hints, never send/claim authority. */
export async function listQualityJourneyWakeWork(
  input: WakeScope,
  client: PrismaClient = prisma,
  clock: Clock = () => new Date(),
) {
  return client.$transaction(async tx => {
    const now = clock()
    const canonical = await canonicalWork(input, tx, now)
    const pending = await tx.qualityJourneyWakeIntent.findMany({
      where: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        OR: [{ status: 'PENDING' }, { status: 'CLAIMED', claimExpiresAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize,
    })
    // This scan intentionally survives an ACK followed by a crash before prepare.
    return { pending, ...canonical }
  })
}

async function readWakeForMutation(input: WakeClaim, tx: Prisma.TransactionClient) {
  await assertManagedScope(input, tx, true)
  const wake = await tx.qualityJourneyWakeIntent.findFirst({
    where: { id: input.wakeId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!wake) throw conflict()
  return wake
}

function isCurrentClaimReplay(wake: QualityJourneyWakeIntent, claimOwner: string, now: Date) {
  if (wake.status === 'PENDING') return false
  if (wake.status !== 'CLAIMED' || !wake.claimExpiresAt) throw conflict()
  if (wake.claimExpiresAt <= now) return false
  if (wake.claimOwner !== claimOwner) throw conflict()
  return true
}

function assertExactWakeClaim(wake: QualityJourneyWakeIntent, input: WakeClaim & { claimEpoch: number }) {
  if (wake.claimOwner !== input.claimOwner || wake.claimEpoch !== input.claimEpoch) throw conflict()
}

function assertUnexpiredWakeClaim(wake: QualityJourneyWakeIntent, now: Date) {
  if (wake.status !== 'CLAIMED' || !wake.claimExpiresAt || wake.claimExpiresAt <= now) throw conflict()
}

export async function claimQualityJourneyWake(
  input: WakeClaim,
  client: PrismaClient = prisma,
  clock: Clock = () => new Date(),
) {
  assertMachineKey(input.claimOwner)
  return client.$transaction(async tx => {
    const now = clock()
    const wake = await readWakeForMutation(input, tx)
    if (isCurrentClaimReplay(wake, input.claimOwner, now)) return wake
    const claimed = await tx.qualityJourneyWakeIntent.updateMany({
      where: { id: wake.id, status: wake.status, claimEpoch: wake.claimEpoch, claimExpiresAt: wake.claimExpiresAt },
      data: {
        status: 'CLAIMED',
        claimOwner: input.claimOwner,
        claimEpoch: { increment: 1 },
        claimExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      },
    })
    if (claimed.count !== 1) throw conflict()
    return tx.qualityJourneyWakeIntent.findUniqueOrThrow({ where: { id: wake.id } })
  })
}

/** ACK records only a canonical observation. It neither dispatches nor completes work. */
export async function acknowledgeQualityJourneyWake(
  input: WakeClaim & { claimEpoch: number },
  client: PrismaClient = prisma,
  clock: Clock = () => new Date(),
) {
  assertMachineKey(input.claimOwner)
  if (!Number.isSafeInteger(input.claimEpoch) || input.claimEpoch < 1) throw conflict()
  return client.$transaction(async tx => {
    const now = clock()
    const wake = await readWakeForMutation(input, tx)
    assertExactWakeClaim(wake, input)
    if (wake.status === 'ACKNOWLEDGED') return { wake, replayed: true }
    assertUnexpiredWakeClaim(wake, now)
    const canonical = await canonicalWork(input, tx, now)
    const acknowledged = await tx.qualityJourneyWakeIntent.updateMany({
      where: {
        id: wake.id,
        status: 'CLAIMED',
        claimOwner: input.claimOwner,
        claimEpoch: input.claimEpoch,
        claimExpiresAt: { gt: now },
      },
      data: {
        status: 'ACKNOWLEDGED',
        processingOutcome: JSON.stringify({
          outcome: canonical.outcome,
          observedHighWaterSequence: canonical.highWaterSequence,
        }),
        acknowledgedAt: now,
      },
    })
    if (acknowledged.count !== 1) throw conflict()
    return {
      wake: await tx.qualityJourneyWakeIntent.findUniqueOrThrow({ where: { id: wake.id } }),
      replayed: false,
      observedHighWaterSequence: canonical.highWaterSequence,
    }
  })
}
