import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'
import { createHash, randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  QualityJourney,
  QualityJourneyProviderRun,
  QualityJourneyProviderObservation,
} from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  assertProviderSenderDisabled,
  assertProviderSendPermitOwned,
  createProviderSendPermit,
  consumeProviderSendPermit,
  providerIntentPolicy,
  trustedProviderObservation,
  trustedProviderArm,
  trustedProviderReconciliation,
  type ProviderSenderExcluded,
  type ProviderSenderDisabled,
  type ProviderSendPermit,
} from '@/lib/quality-journey/provider-intent-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  validateProviderReconciliationEvidence,
  assertCommittedProviderSourceReplay,
  assertProviderReceiptCanonicalIdentity,
  assertProviderReceiptBoundaryIdentity,
  captureProviderReconciliationContext,
  providerReconciliationRequestHash,
  ProviderReconciliationConflictError,
  type ProviderReconciliationContext,
  type ProviderReconciliationReceipt,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import {
  acquireOriginalSqliteOutcomeCustody,
  beginOriginalSqliteDiscardSend,
  readOriginalSqliteCommittedReplay,
  resolveOriginalSqliteRetirementFromReplay,
  type SqliteOutcomeCustody,
} from '@/lib/quality-journey/codex-app-server/outcome-source'
import {
  providerSourceDatabaseIsOwned,
  providerSourceDatabaseFor,
  readProviderSourceCommittedSnapshot,
} from '@/lib/quality-journey/provider-source-database'
import { outcomeSourceBounds } from '@/lib/quality-journey/codex-app-server/outcome-source-contract'
import {
  sqliteOutcomeSourceProtocolDigest,
  type SourceLedgerState,
  readProviderSourceLedgerRecords,
} from '@/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal'
import { assertCoordinatorMutationSession } from './quality-journey-coordinator-session'
import {
  authenticateExternalQualityJourneySubmission,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'
import {
  enqueueQualityJourneyWakeInTransaction,
  trustedQualityJourneyWakeProducer,
} from './quality-journey-wake-service'
import { assertQualityJourneyMutable } from './quality-journey-terminal'

const json = canonicalContractJson
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}
function unauthorized(): never {
  throw new ServiceError('Provider assignment authority is invalid.', 'UNAUTHORIZED')
}
const id = (prefix: string) => `${prefix}_${randomUUID()}`
const after = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000)
const validDigest = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value)
const boundedIdentifier = (value: string) => /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value)
type Binding = ExternalQualityJourneySubmissionBinding
export type PrepareQualityJourneyProviderRunInput = Binding & {
  idempotencyKey: string
  providerNamespace: string
  configurationDigest: string
  envelopeDigest: string
}
export type ClaimQualityJourneyProviderIntentInput = Binding & { intentId: string; claimOwner: string }
export type ArmQualityJourneyProviderIntentInput = ClaimQualityJourneyProviderIntentInput & { claimEpoch: number }

async function authenticate(input: Binding, tx: Prisma.TransactionClient) {
  await authenticateExternalQualityJourneySubmission(input, tx)
  const attempt = await tx.qualityJourneyWorkAttempt.findUniqueOrThrow({
    where: { id: input.attemptId },
    include: {
      workItem: true,
      sessionBinding: true,
      authorization: { include: { successorAuthorization: { select: { id: true } } } },
    },
  })
  return attempt
}

type AuthenticatedAttempt = Awaited<ReturnType<typeof authenticate>>
type ProviderIntent = Prisma.QualityJourneyProviderDispatchIntentGetPayload<{ include: { run: true } }>

function managedSessionIdentity(input: Binding, journey: QualityJourney, attempt: AuthenticatedAttempt) {
  const binding = attempt.sessionBinding
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    !binding?.sessionId ||
    binding.coordinatorGeneration == null ||
    input.coordinatorPrincipalId !== input.principal.principalId
  )
    conflict('Provider work is not currently eligible.')
  return { sessionId: binding.sessionId, coordinatorGeneration: binding.coordinatorGeneration }
}

function assertLiveWork(journey: QualityJourney, attempt: AuthenticatedAttempt) {
  const item = attempt.workItem
  if (
    attempt.status !== 'IN_PROGRESS' ||
    item.status !== 'IN_PROGRESS' ||
    item.currentAttempt !== attempt.attempt ||
    journey.activeCycleId !== item.cycleId ||
    attempt.leaseExpiresAt <= new Date() ||
    attempt.cancelledAt ||
    attempt.attempt > providerIntentPolicy.maxAttempts
  )
    conflict('Provider work is not currently eligible.')
}

function assertNoHumanWait(journey: QualityJourney) {
  if (JSON.parse(journey.unresolvedQuestionIdsJson).length > 0 || JSON.parse(journey.blockerIdsJson).length > 0)
    conflict('Provider work is not currently eligible.')
}

function currentAuthorization(attempt: AuthenticatedAttempt) {
  const authorization = attempt.authorization
  if (!authorization || authorization.cancelledAt || authorization.revokedAt || authorization.successorAuthorization)
    conflict('Provider work is not currently eligible.')
  return authorization
}

function assertAuthorizationScope(input: Binding, attempt: AuthenticatedAttempt) {
  const authorization = currentAuthorization(attempt)
  const item = attempt.workItem
  if (
    authorization.workItemId !== item.id ||
    authorization.journeyId !== input.journeyId ||
    authorization.targetProjectId !== input.targetProjectId ||
    authorization.role !== item.role ||
    authorization.roleContractDigest !== item.roleContractDigest
  )
    conflict('Provider work is not currently eligible.')
  if (
    authorization.externalAdmissionProtocol !== 'EXTERNAL_V1' ||
    authorization.externalPrincipalId !== input.principal.principalId ||
    authorization.externalPrincipalAssurance !== input.principal.assurance
  )
    conflict('Provider work is not currently eligible.')
  return authorization
}

function assertAdmittedAssignment(attempt: AuthenticatedAttempt) {
  if (
    !attempt.assignmentHash ||
    !attempt.assignmentJson ||
    attempt.assignmentHash !== hash(JSON.parse(attempt.assignmentJson))
  )
    conflict('Provider work is not currently eligible.')
  if (
    !attempt.externalAdmissionId ||
    !attempt.externalAdmissionHash ||
    !attempt.externalAdmissionJson ||
    attempt.externalAdmissionHash !== hash(JSON.parse(attempt.externalAdmissionJson))
  )
    conflict('Provider work is not currently eligible.')
}

async function assertAttemptBudget(attempt: AuthenticatedAttempt, tx: Prisma.TransactionClient) {
  const authorization = currentAuthorization(attempt)
  const authorizationAttempts = await tx.qualityJourneyWorkAttempt.count({
    where: { authorizationId: authorization.id },
  })
  const workAttempts = await tx.qualityJourneyWorkAttempt.count({ where: { workItemId: attempt.workItemId } })
  if (authorizationAttempts > authorization.maxAttempts || workAttempts > providerIntentPolicy.maxAttempts)
    conflict('Provider attempt budget is exhausted.')
}

function authoritySnapshot(input: Binding, journey: QualityJourney, attempt: AuthenticatedAttempt) {
  const item = attempt.workItem
  const authorization = currentAuthorization(attempt)
  const binding = managedSessionIdentity(input, journey, attempt)
  return {
    attemptId: attempt.id,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    workItemId: item.id,
    role: item.role,
    sessionId: binding.sessionId,
    coordinatorGeneration: binding.coordinatorGeneration,
    principalId: input.principal.principalId,
    assignmentId: attempt.assignmentId!,
    assignmentGeneration: attempt.assignmentGeneration,
    authorizationId: authorization.id,
    authorizationHash: authorization.authorizationHash,
    admissionId: attempt.externalAdmissionId!,
    admissionHash: attempt.externalAdmissionHash!,
    leaseId: attempt.leaseId,
    inputHash: item.inputHash,
    scopeHash: hash(item.authorizationScopeJson),
    revisionHash: hash({
      revisions: journey.activeRevisionIdsJson,
      cycleId: journey.activeCycleId,
      roleContractDigest: item.roleContractDigest,
    }),
    assignmentHash: attempt.assignmentHash!,
  }
}
type AuthoritySnapshot = ReturnType<typeof authoritySnapshot>

function assertRunCurrent(run: QualityJourneyProviderRun, snapshot: AuthoritySnapshot) {
  for (const key of Object.keys(snapshot) as (keyof AuthoritySnapshot)[])
    if (run[key] !== snapshot[key]) conflict('Provider immutable correlation is stale.')
  if (
    run.unresolvedRetentionAt <= new Date() ||
    run.terminalReconciledAt ||
    ['CONFLICT', 'INVALIDATED'].includes(run.status)
  )
    conflict('Provider run requires explicit recovery.')
}

async function currentAuthority(input: Binding, tx: Prisma.TransactionClient, run?: QualityJourneyProviderRun) {
  const attempt = await authenticate(input, tx)
  await assertCoordinatorMutationSession(input, { ...input, attemptId: input.attemptId }, tx)
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: input.journeyId } })
  assertQualityJourneyMutable(journey)
  managedSessionIdentity(input, journey, attempt)
  assertLiveWork(journey, attempt)
  assertNoHumanWait(journey)
  assertAuthorizationScope(input, attempt)
  assertAdmittedAssignment(attempt)
  await assertAttemptBudget(attempt, tx)
  await assertHistoricalHubQuiescent(tx)
  const snapshot = authoritySnapshot(input, journey, attempt)
  if (run) assertRunCurrent(run, snapshot)
  return snapshot
}

export async function prepareQualityJourneyProviderRun(
  input: PrepareQualityJourneyProviderRunInput,
  client: PrismaClient = prisma,
) {
  if (
    !boundedIdentifier(input.idempotencyKey) ||
    !boundedIdentifier(input.providerNamespace) ||
    !validDigest(input.configurationDigest) ||
    !validDigest(input.envelopeDigest)
  )
    throw new ServiceError('Provider intent identifiers and digests are invalid.', 'VALIDATION')
  const requestHash = hash({
    attemptId: input.attemptId,
    idempotencyKey: input.idempotencyKey,
    providerNamespace: input.providerNamespace,
    configurationDigest: input.configurationDigest,
    envelopeDigest: input.envelopeDigest,
  })
  return client.$transaction(async tx => {
    await authenticate(input, tx)
    const existing = await tx.qualityJourneyProviderRun.findUnique({ where: { attemptId: input.attemptId } })
    if (existing) {
      if (existing.prepareRequestHash !== requestHash || existing.prepareKey !== input.idempotencyKey)
        conflict('Provider preparation identity was reused with different input.')
      return {
        replayed: true,
        run: existing,
        intent: await tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
          where: { providerRunId_turnOrdinal: { providerRunId: existing.id, turnOrdinal: 1 } },
        }),
      }
    }
    const snapshot = await currentAuthority(input, tx)
    const now = new Date()
    const run = await tx.qualityJourneyProviderRun.create({
      data: {
        ...snapshot,
        id: id('qjpr'),
        providerNamespace: input.providerNamespace,
        configurationDigest: input.configurationDigest,
        prepareKey: input.idempotencyKey,
        prepareRequestHash: requestHash,
        policyJson: json(providerIntentPolicy),
        earliestIntentAt: now,
        unresolvedRetentionAt: after(now, providerIntentPolicy.unresolvedRetentionSeconds),
      },
    })
    const intent = await tx.qualityJourneyProviderDispatchIntent.create({
      data: {
        id: id('qjpdi'),
        providerRunId: run.id,
        turnOrdinal: 1,
        operationKey: input.idempotencyKey,
        requestHash,
        envelopeDigest: input.envelopeDigest,
        providerNamespace: input.providerNamespace,
      },
    })
    await enqueueQualityJourneyWakeInTransaction(
      {
        journeyId: run.journeyId,
        targetProjectId: run.targetProjectId,
        causeKey: `provider-run:${run.id}:initial`,
        reason: 'PROVIDER_INTENT_PREPARED',
      },
      tx,
      trustedQualityJourneyWakeProducer,
    )
    await tx.qualityJourneyProviderSlot.upsert({ where: { id: 'HUB' }, create: { id: 'HUB' }, update: {} })
    return { replayed: false, run, intent }
  })
}

async function readIntent(input: Binding & { intentId: string }, tx: Prisma.TransactionClient) {
  const intent = await tx.qualityJourneyProviderDispatchIntent.findUnique({
    where: { id: input.intentId },
    include: { run: true },
  })
  if (
    !intent ||
    intent.run.attemptId !== input.attemptId ||
    intent.run.journeyId !== input.journeyId ||
    intent.run.targetProjectId !== input.targetProjectId
  )
    unauthorized()
  return intent
}

function isSameLiveClaim(intent: ProviderIntent, claimOwner: string, now: Date) {
  return (
    intent.status === 'CLAIMED' &&
    intent.claimOwner === claimOwner &&
    intent.claimExpiresAt &&
    intent.claimExpiresAt > now &&
    !intent.sendBoundaryId
  )
}

function assertIntentClaimable(intent: ProviderIntent, slotOccupied: boolean, now: Date) {
  if (
    slotOccupied ||
    intent.sendBoundaryId ||
    !['PENDING', 'CLAIMED'].includes(intent.status) ||
    (intent.claimExpiresAt && intent.claimExpiresAt > now)
  )
    conflict('Provider intent is not claimable.')
}

function assertOwnedClaimCurrent(intent: ProviderIntent, input: ArmQualityJourneyProviderIntentInput, now: Date) {
  if (
    intent.status !== 'CLAIMED' ||
    intent.claimOwner !== input.claimOwner ||
    intent.claimEpoch !== input.claimEpoch ||
    !intent.claimExpiresAt ||
    intent.claimExpiresAt <= now
  )
    conflict('Provider claim lease or epoch is stale.')
}

export async function claimQualityJourneyProviderIntent(
  input: ClaimQualityJourneyProviderIntentInput,
  client: PrismaClient = prisma,
) {
  if (!boundedIdentifier(input.claimOwner)) throw new ServiceError('Provider claim owner is invalid.', 'VALIDATION')
  return client.$transaction(async tx => {
    const intent = await readIntent(input, tx)
    await currentAuthority(input, tx, intent.run)
    const now = new Date()
    const slot = await tx.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } })
    if (isSameLiveClaim(intent, input.claimOwner, now)) return { replayed: true, run: intent.run, intent }
    assertIntentClaimable(intent, Boolean(slot?.intentId), now)
    const claimed = await tx.qualityJourneyProviderDispatchIntent.updateMany({
      where: { id: intent.id, claimEpoch: intent.claimEpoch, sendBoundaryId: null, status: intent.status },
      data: {
        status: 'CLAIMED',
        claimOwner: input.claimOwner,
        claimEpoch: { increment: 1 },
        claimExpiresAt: after(now, providerIntentPolicy.leaseSeconds),
      },
    })
    if (claimed.count !== 1) conflict('Provider intent claim changed concurrently.')
    return {
      replayed: false,
      run: intent.run,
      intent: await tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    }
  })
}

export async function armQualityJourneyProviderIntent(
  input: ArmQualityJourneyProviderIntentInput,
  client: PrismaClient = prisma,
) {
  const result = await client.$transaction(async tx => {
    await authenticate(input, tx)
    const intent = await readIntent(input, tx)
    // Durable replay is observational only. Never remint a permit.
    if (intent.sendBoundaryId) return { replayed: true as const, run: intent.run, intent }
    await currentAuthority(input, tx, intent.run)
    const now = new Date()
    assertOwnedClaimCurrent(intent, input, now)
    const sendBoundaryId = id('qjps')
    const slot = await tx.qualityJourneyProviderSlot.updateMany({
      where: { id: 'HUB', intentId: null, providerRunId: null },
      data: {
        providerRunId: intent.run.id,
        intentId: intent.id,
        sendBoundaryId,
        reservedAt: now,
        version: { increment: 1 },
      },
    })
    if (slot.count !== 1) conflict('Hub provider slot is occupied or uncertain.')
    const reserved = await tx.qualityJourneyProviderRun.updateMany({
      where: { id: intent.run.id, turnsReserved: { lt: providerIntentPolicy.maxTurns }, status: 'PREPARED' },
      data: { turnsReserved: { increment: 1 }, status: 'UNKNOWN' },
    })
    if (reserved.count !== 1) conflict('Provider turn budget is exhausted or fenced.')
    const armed = await tx.qualityJourneyProviderDispatchIntent.updateMany({
      where: {
        id: intent.id,
        status: 'CLAIMED',
        claimOwner: input.claimOwner,
        claimEpoch: input.claimEpoch,
        sendBoundaryId: null,
      },
      data: {
        sendBoundaryId,
        armedAt: now,
        status: 'UNKNOWN',
        acknowledgementDueAt: after(now, providerIntentPolicy.acknowledgementSeconds),
        turnDueAt: after(now, providerIntentPolicy.turnSeconds),
      },
    })
    if (armed.count !== 1) conflict('Provider send boundary changed concurrently.')
    return {
      replayed: false as const,
      run: await tx.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: intent.run.id } }),
      intent: await tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    }
  })
  return {
    ...result,
    ...(!result.replayed
      ? {
          permit: createProviderSendPermit(
            {
              runId: result.run.id,
              intentId: result.intent.id,
              sendBoundaryId: result.intent.sendBoundaryId!,
              claimEpoch: result.intent.claimEpoch,
            },
            trustedProviderArm,
          ),
        }
      : {}),
  }
}

function assertPermitIdentity(intent: ProviderIntent, permit: ProviderSendPermit) {
  if (
    intent.sendBoundaryId !== permit.sendBoundaryId ||
    intent.run.id !== permit.runId ||
    intent.claimEpoch !== permit.claimEpoch
  )
    conflict('Provider send permit is no longer current.')
}

function assertSendWindowCurrent(intent: ProviderIntent) {
  const now = new Date()
  if (
    intent.reconciledAt ||
    intent.status !== 'UNKNOWN' ||
    !intent.acknowledgementDueAt ||
    intent.acknowledgementDueAt <= now ||
    !intent.turnDueAt ||
    intent.turnDueAt <= now
  )
    conflict('Provider send permit is no longer current.')
}

/** Last canonical check before the caller's external sink; the committed marker remains UNKNOWN. */
export async function consumeQualityJourneyProviderSendPermit(
  input: Binding & { permit: ProviderSendPermit },
  client: PrismaClient = prisma,
) {
  await client.$transaction(async tx => {
    const intent = await readIntent({ ...input, intentId: input.permit.intentId }, tx)
    await currentAuthority(input, tx, intent.run)
    assertPermitIdentity(intent, input.permit)
    assertSendWindowCurrent(intent)
  })
  return consumeProviderSendPermit(input.permit)
}

const sourceStateSelection = {
  sourceId: true,
  sourceIncarnation: true,
  providerRunId: true,
  intentId: true,
  providerNamespace: true,
  identityJson: true,
  protocolDigest: true,
  qualificationDigest: true,
  epoch: true,
  lifecycle: true,
  sequence: true,
  head: true,
  byteCount: true,
  sealedHead: true,
  sealedEnvelopeDigest: true,
  commitFenceVersion: true,
  committedObservationId: true,
  committedRequestHash: true,
  pendingBatchId: true,
  pendingBatchStartHead: true,
  pendingBatchRecordAllowance: true,
  pendingBatchByteAllowance: true,
  pendingBatchRequestDigest: true,
} as const satisfies Record<keyof SourceLedgerState, true>

async function assertOriginalDiscardReservation(expected: SourceLedgerState, tx: Prisma.TransactionClient) {
  const actual = await tx.qualityJourneyProviderSourceState.findFirst({
    where: { ...expected },
    select: { sourceId: true },
  })
  if (!actual) conflict('Original source discard reservation is no longer current.')
}

/**
 * Serialize each owned write against canonical pause/transfer using the M03 ownership CAS.
 * send must enter its synchronous, revocable write gate before returning. Its reply is
 * boxed so the database transaction never waits for an RPC acknowledgement. A failed
 * commit after I/O retains the already committed UNKNOWN boundary; callers never retry.
 */
export async function writeQualityJourneyProviderTransport<T>(
  input: Binding & { permit: ProviderSendPermit; consume: boolean },
  send: () => Promise<T>,
  client: PrismaClient = prisma,
): Promise<{ reply: Promise<T> }> {
  const captured = Object.freeze({ ...input, principal: Object.freeze({ ...input.principal }) })
  assertProviderSendPermitOwned(captured.permit)
  const operation = await beginOriginalSqliteDiscardSend(captured.permit, client)
  let engineOperation: Promise<{ reply: Promise<T> }> | undefined
  try {
    engineOperation = client.$transaction(async tx => {
      if (operation) await operation.assertTransactionSettings(tx)
      const intent = await readIntent({ ...captured, intentId: captured.permit.intentId }, tx)
      await currentAuthority(captured, tx, intent.run)
      if (operation) await assertOriginalDiscardReservation(operation.reservation, tx)
      assertPermitIdentity(intent, captured.permit)
      if (captured.consume) assertSendWindowCurrent(intent)
      else if (
        intent.reconciledAt ||
        intent.run.status === 'CONFLICT' ||
        !intent.turnDueAt ||
        intent.turnDueAt <= new Date()
      )
        conflict('Provider transport is fenced or expired.')
      assertProviderSendPermitOwned(captured.permit)
      const sendOriginal = () => {
        if (captured.consume) consumeProviderSendPermit(captured.permit)
        return send()
      }
      if (operation) return operation.capture(sendOriginal)
      const reply = sendOriginal()
      // Observe rejection even if commit acknowledgement is lost before returning the box.
      void reply.catch(() => {})
      return { reply }
    })
    const result = await engineOperation
    await operation?.completeFulfilled()
    return result
  } catch (error) {
    operation?.retire(engineOperation)
    throw error
  }
}

export type ProviderObservationInput = {
  intentId: string
  sendBoundaryId: string
  providerNamespace: string
  observationKey: string
  evidenceDigest: string
}
export type ProviderAcknowledgementInput = ProviderObservationInput & { threadId: string; turnId: string }

function validateObservation(input: ProviderObservationInput) {
  if (
    !boundedIdentifier(input.intentId) ||
    !boundedIdentifier(input.sendBoundaryId) ||
    !boundedIdentifier(input.providerNamespace) ||
    !boundedIdentifier(input.observationKey) ||
    !validDigest(input.evidenceDigest)
  )
    throw new ServiceError('Provider observation identifiers and evidence digest are invalid.', 'VALIDATION')
}

async function readObservedIntent(input: ProviderObservationInput, tx: Prisma.TransactionClient) {
  const intent = await tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
    where: { id: input.intentId },
    include: { run: true },
  })
  if (!intent.sendBoundaryId || intent.sendBoundaryId !== input.sendBoundaryId)
    conflict('Provider observation does not bind its durable send boundary.')
  return { ...intent, sendBoundaryId: intent.sendBoundaryId }
}

function readPriorObservation(input: ProviderObservationInput, tx: Prisma.TransactionClient) {
  return tx.qualityJourneyProviderObservation.findUnique({
    where: { intentId_observationKey: { intentId: input.intentId, observationKey: input.observationKey } },
  })
}

async function replayAcknowledgement(
  prior: QualityJourneyProviderObservation,
  requestHash: string,
  runId: string,
  tx: Prisma.TransactionClient,
) {
  if (prior.requestHash !== requestHash) {
    await tx.qualityJourneyProviderRun.update({ where: { id: runId }, data: { status: 'CONFLICT' } })
    return { conflicted: true, replayed: true, observation: prior }
  }
  return { conflicted: prior.kind === 'ACK_CONFLICT', replayed: true, observation: prior }
}

const changedHandle = (known: string | null, observed: string) => known !== null && known !== observed
function changedNativeCorrelation(input: ProviderAcknowledgementInput, intent: ProviderIntent) {
  return (
    input.providerNamespace !== intent.providerNamespace ||
    changedHandle(intent.run.threadId, input.threadId) ||
    changedHandle(intent.threadId, input.threadId) ||
    changedHandle(intent.turnId, input.turnId)
  )
}

async function acknowledgementConflicts(
  input: ProviderAcknowledgementInput,
  intent: ProviderIntent,
  tx: Prisma.TransactionClient,
) {
  const threadOwner = await tx.qualityJourneyProviderRun.findFirst({
    where: { providerNamespace: input.providerNamespace, threadId: input.threadId, id: { not: intent.run.id } },
  })
  const turnOwner = await tx.qualityJourneyProviderDispatchIntent.findFirst({
    where: {
      providerNamespace: input.providerNamespace,
      threadId: input.threadId,
      turnId: input.turnId,
      id: { not: intent.id },
    },
  })
  return Boolean(
    intent.status === 'NONSTART_RECONCILED' || threadOwner || turnOwner || changedNativeCorrelation(input, intent),
  )
}

async function applyAcknowledgement(
  input: ProviderAcknowledgementInput,
  intent: ProviderIntent,
  tx: Prisma.TransactionClient,
) {
  const runStatus = !intent.reconciledAt && intent.run.status !== 'CONFLICT' ? { status: 'ACKNOWLEDGED' } : {}
  const intentStatus = !intent.reconciledAt ? { status: 'ACKNOWLEDGED' } : {}
  await tx.qualityJourneyProviderRun.update({
    where: { id: intent.run.id },
    data: { threadId: input.threadId, ...runStatus },
  })
  await tx.qualityJourneyProviderDispatchIntent.update({
    where: { id: intent.id },
    data: {
      threadId: input.threadId,
      turnId: input.turnId,
      acknowledgedAt: intent.acknowledgedAt ?? new Date(),
      ...intentStatus,
    },
  })
}

export async function recordQualityJourneyProviderAcknowledgement(
  input: ProviderAcknowledgementInput,
  capability: typeof trustedProviderObservation,
  client: PrismaClient = prisma,
) {
  if (capability !== trustedProviderObservation) unauthorized()
  validateObservation(input)
  if (!boundedIdentifier(input.threadId) || !boundedIdentifier(input.turnId))
    throw new ServiceError('Provider native handles are invalid.', 'VALIDATION')
  const requestHash = hash(input)
  const result = await client.$transaction(async tx => {
    const intent = await readObservedIntent(input, tx)
    const prior = await readPriorObservation(input, tx)
    if (prior) return replayAcknowledgement(prior, requestHash, intent.run.id, tx)
    const conflicted = await acknowledgementConflicts(input, intent, tx)
    const observation = await tx.qualityJourneyProviderObservation.create({
      data: { ...input, id: id('qjpo'), requestHash, kind: conflicted ? 'ACK_CONFLICT' : 'ACKNOWLEDGED' },
    })
    if (conflicted) {
      await tx.qualityJourneyProviderRun.update({ where: { id: intent.run.id }, data: { status: 'CONFLICT' } })
    } else {
      await applyAcknowledgement(input, intent, tx)
    }
    return { conflicted, replayed: false, observation }
  })
  if (result.conflicted) conflict('Provider native correlation conflicts; the run remains fenced.')
  return result
}

function assertReconciliationAllowed(intent: ProviderIntent, outcome: 'NONSTART' | 'TERMINAL') {
  if (intent.reconciledAt || intent.run.status === 'CONFLICT' || (outcome === 'NONSTART' && intent.acknowledgedAt))
    conflict('Provider reconciliation conflicts with retained evidence.')
}

/** Finalize only after validated evidence has been inserted in this same transaction. */
async function finalizeReconciledProviderIntent(
  intent: ProviderIntent,
  outcome: 'NONSTART' | 'TERMINAL',
  now: Date,
  tx: Prisma.TransactionClient,
) {
  await tx.qualityJourneyProviderDispatchIntent.update({
    where: { id: intent.id },
    data: { reconciledAt: now, status: `${outcome}_RECONCILED` },
  })
  await tx.qualityJourneyProviderRun.update({
    where: { id: intent.run.id },
    data: {
      status: `${outcome}_RECONCILED`,
      terminalReconciledAt: now,
      terminalRetentionAt: after(now, providerIntentPolicy.terminalRetentionSeconds),
    },
  })
  const released = await tx.qualityJourneyProviderSlot.updateMany({
    where: { id: 'HUB', providerRunId: intent.run.id, intentId: intent.id, sendBoundaryId: intent.sendBoundaryId },
    data: { providerRunId: null, intentId: null, sendBoundaryId: null, reservedAt: null, version: { increment: 1 } },
  })
  if (released.count !== 1) conflict('Provider hub slot no longer binds exact reconciliation identity.')
}

/** Evidence records physical reconciliation only; no canonical acceptance or replacement is granted. */
export async function reconcileQualityJourneyProviderIntent(
  input: ProviderObservationInput & { outcome: 'NONSTART' | 'TERMINAL'; senderDisabled?: ProviderSenderDisabled },
  capability: typeof trustedProviderReconciliation,
  client: PrismaClient = prisma,
) {
  if (capability !== trustedProviderReconciliation) unauthorized()
  validateObservation(input)
  if (!['NONSTART', 'TERMINAL'].includes(input.outcome))
    throw new ServiceError('Provider reconciliation outcome is invalid.', 'VALIDATION')
  const requestHash = hash({
    intentId: input.intentId,
    sendBoundaryId: input.sendBoundaryId,
    providerNamespace: input.providerNamespace,
    observationKey: input.observationKey,
    evidenceDigest: input.evidenceDigest,
    outcome: input.outcome,
  })
  return client.$transaction(async tx => {
    const intent = await readObservedIntent(input, tx)
    if (input.providerNamespace !== intent.providerNamespace)
      conflict('Provider reconciliation does not bind exact send identity.')
    const prior = await readPriorObservation(input, tx)
    if (prior) {
      if (prior.requestHash !== requestHash) conflict('Provider reconciliation key was reused with different evidence.')
      return { replayed: true, observation: prior }
    }
    if (!input.senderDisabled) conflict('Exact original provider sender must be disabled before release.')
    assertProviderSenderDisabled(input.senderDisabled, {
      runId: intent.run.id,
      intentId: intent.id,
      sendBoundaryId: intent.sendBoundaryId,
      claimEpoch: intent.claimEpoch,
    })
    assertReconciliationAllowed(intent, input.outcome)
    const now = new Date()
    const observation = await tx.qualityJourneyProviderObservation.create({
      data: {
        id: id('qjpo'),
        intentId: intent.id,
        observationKey: input.observationKey,
        sendBoundaryId: input.sendBoundaryId,
        providerNamespace: input.providerNamespace,
        evidenceDigest: input.evidenceDigest,
        kind: input.outcome,
        requestHash,
      },
    })
    await finalizeReconciledProviderIntent(intent, input.outcome, now, tx)
    return { replayed: false, observation }
  })
}

export type ReconcileConsumedProviderIntentInput = {
  intentId: string
  observationKey: string
  senderExcluded?: ProviderSenderExcluded
  physicalEvidence?: unknown
  /** Read-only exact durable replay; never recreates either live capability. */
  replayRequestHash?: string
}

function assertConsumedReceiptBoundaryIdentity(receipt: ProviderReconciliationReceipt, intent: ProviderIntent) {
  assertProviderReceiptBoundaryIdentity(receipt, {
    runId: intent.run.id,
    intentId: intent.id,
    sendBoundaryId: intent.sendBoundaryId,
    claimEpoch: intent.claimEpoch,
    providerNamespace: intent.providerNamespace,
    configurationDigest: intent.run.configurationDigest,
  })
}

function assertConsumedReceiptIdentity(receipt: ProviderReconciliationReceipt, intent: ProviderIntent) {
  assertProviderReceiptCanonicalIdentity(receipt, {
    runId: intent.run.id,
    intentId: intent.id,
    sendBoundaryId: intent.sendBoundaryId,
    claimEpoch: intent.claimEpoch,
    providerNamespace: intent.providerNamespace,
    configurationDigest: intent.run.configurationDigest,
    runThreadId: intent.run.threadId,
    intentThreadId: intent.threadId,
    turnId: intent.turnId,
  })
}

async function quarantineConsumedReconciliation(
  intent: ProviderIntent,
  receipt: ProviderReconciliationReceipt,
  requestHash: string,
  tx: Prisma.TransactionClient,
) {
  const observationKey = `reconciliation-conflict:${requestHash.slice(7)}`
  await tx.qualityJourneyProviderObservation.upsert({
    where: { intentId_observationKey: { intentId: intent.id, observationKey } },
    create: {
      id: id('qjpo'),
      intentId: intent.id,
      observationKey,
      kind: 'RECONCILIATION_CONFLICT',
      requestHash,
      sendBoundaryId: intent.sendBoundaryId!,
      providerNamespace: intent.providerNamespace,
      threadId: receipt.identity.threadId,
      turnId: receipt.identity.turnId,
      evidenceDigest: hash(receipt),
      reconciliationJson: json(receipt),
    },
    update: {},
  })
  await tx.qualityJourneyProviderRun.update({ where: { id: intent.run.id }, data: { status: 'CONFLICT' } })
}

type ConsumedReconciliationRequest = {
  input: ReconcileConsumedProviderIntentInput
  candidate?: ProviderReconciliationReceipt
  requestHash: string
  sourceConflict: boolean
}

function validateConsumedReconciliationInput(input: ReconcileConsumedProviderIntentInput) {
  if (
    !boundedIdentifier(input.intentId) ||
    !boundedIdentifier(input.observationKey) ||
    (input.replayRequestHash !== undefined && !validDigest(input.replayRequestHash))
  )
    throw new ServiceError('Provider reconciliation identity is invalid.', 'VALIDATION')
}

function readConsumedReconciliationProof(
  input: ReconcileConsumedProviderIntentInput,
  context: ProviderReconciliationContext,
) {
  let candidate: ProviderReconciliationReceipt | undefined
  let sourceConflict = false
  if (input.senderExcluded) {
    try {
      candidate = validateProviderReconciliationEvidence(input.senderExcluded, input.physicalEvidence, context)
    } catch (error) {
      if (!(error instanceof ProviderReconciliationConflictError)) throw error
      candidate = error.receipt
      sourceConflict = true
    }
  } else if (!input.replayRequestHash) {
    conflict('Exact original provider sender exclusion and physical evidence are required.')
  }
  return { candidate, sourceConflict }
}

function consumedReconciliationRequest(
  input: ReconcileConsumedProviderIntentInput,
  context: ProviderReconciliationContext,
): ConsumedReconciliationRequest {
  validateConsumedReconciliationInput(input)
  const { candidate, sourceConflict } = readConsumedReconciliationProof(input, context)
  const requestHash = candidate
    ? providerReconciliationRequestHash(input.intentId, input.observationKey, candidate)
    : input.replayRequestHash!
  if (input.replayRequestHash && input.replayRequestHash !== requestHash)
    conflict('Provider reconciliation replay hash does not match exact evidence.')
  return { input, candidate, requestHash, sourceConflict }
}

/** Validate the actual stored receipt before checking its observation or source binding. */
function readCommittedConsumedReceipt(
  prior: QualityJourneyProviderObservation,
  intent: ProviderIntent,
  request: ConsumedReconciliationRequest,
) {
  const { input, requestHash } = request
  if (!['NONSTART', 'TERMINAL'].includes(prior.kind) || !prior.reconciliationJson || !intent.reconciledAt)
    conflict('Provider reconciliation has no committed exact release receipt.')
  const durable = JSON.parse(prior.reconciliationJson) as ProviderReconciliationReceipt
  if (providerReconciliationRequestHash(input.intentId, input.observationKey, durable) !== requestHash)
    conflict('Provider reconciliation durable receipt digest is invalid.')
  assertConsumedReceiptIdentity(durable, intent)
  return durable
}

function assertConsumedObservationReceipt(
  prior: QualityJourneyProviderObservation,
  durable: ProviderReconciliationReceipt,
) {
  if (
    prior.kind !== durable.physical.outcome ||
    prior.evidenceDigest !== hash(durable) ||
    prior.sendBoundaryId !== durable.identity.sendBoundaryId ||
    prior.providerNamespace !== durable.identity.providerNamespace ||
    prior.threadId !== durable.identity.threadId ||
    prior.turnId !== durable.identity.turnId
  )
    conflict('Provider reconciliation observation does not match its exact receipt.')
}

async function replayConsumedReconciliation(
  prior: QualityJourneyProviderObservation,
  intent: ProviderIntent,
  request: ConsumedReconciliationRequest,
  tx: Prisma.TransactionClient,
) {
  const { candidate, requestHash } = request
  if (prior.requestHash !== requestHash) {
    if (!candidate) conflict('Provider reconciliation key was reused with different evidence.')
    await quarantineConsumedReconciliation(intent, candidate, requestHash, tx)
    return { conflicted: true as const }
  }
  const durable = readCommittedConsumedReceipt(prior, intent, request)
  assertConsumedObservationReceipt(prior, durable)
  const source = await tx.qualityJourneyProviderSourceState.findUnique({
    where: { sourceId: durable.physical.sourceId },
  })
  assertCommittedProviderSourceReplay(source, prior, durable)
  return {
    conflicted: false as const,
    replayed: true,
    observation: prior,
    receipt: durable,
    requestHash,
    quarantined: intent.run.status === 'CONFLICT',
  }
}

function readLegacyReplayEvidence(row: Readonly<Record<string, unknown>>, request: ConsumedReconciliationRequest) {
  const { input, candidate, requestHash } = request
  if (!row.reconciliationJson || typeof row.reconciliationJson !== 'string')
    conflict('Provider reconciliation has no committed exact release receipt.')
  if (
    !candidate ||
    row.sourceId != null ||
    row.intentId !== input.intentId ||
    row.observationKey !== input.observationKey ||
    row.requestHash !== requestHash
  )
    conflict('Legacy provider reconciliation does not match the original validated receipt.')
  return { candidate, storedJson: row.reconciliationJson }
}

function assertLegacyObservationReceipt(
  row: Readonly<Record<string, unknown>>,
  candidate: ProviderReconciliationReceipt,
) {
  if (
    row.kind !== candidate.physical.outcome ||
    !row.reconciledAt ||
    row.observationBoundary !== candidate.identity.sendBoundaryId ||
    row.observationNamespace !== candidate.identity.providerNamespace ||
    row.observationThread !== candidate.identity.threadId ||
    row.observationTurn !== candidate.identity.turnId ||
    row.evidenceDigest !== hash(candidate)
  )
    conflict('Legacy provider reconciliation does not match the original validated receipt.')
}

function assertLegacyStoredCandidateReceipt(
  row: Readonly<Record<string, unknown>>,
  candidate: ProviderReconciliationReceipt,
  storedJson: string,
  requestHash: string,
) {
  if (
    Buffer.byteLength(storedJson) > outcomeSourceBounds.envelopeBytes ||
    json(JSON.parse(storedJson)) !== json(candidate)
  )
    conflict('Legacy stored provider receipt differs from its validated original candidate.')
  assertProviderReceiptCanonicalIdentity(candidate, {
    runId: String(row.providerRunId),
    intentId: String(row.intentId),
    sendBoundaryId: row.sendBoundaryId as string | null,
    claimEpoch: Number(row.claimEpoch),
    providerNamespace: String(row.providerNamespace),
    configurationDigest: String(row.configurationDigest),
    runThreadId: row.runThreadId as string | null,
    intentThreadId: row.intentThreadId as string | null,
    turnId: row.turnId as string | null,
  })
  assertCommittedProviderSourceReplay(null, { id: String(row.observationId), requestHash }, candidate)
}

/** Replay an exact stored legacy receipt through the clean reader without requiring a new SourceState. */
function replayLegacyConsumedSnapshot(row: Readonly<Record<string, unknown>>, request: ConsumedReconciliationRequest) {
  const { input, requestHash } = request
  const { candidate, storedJson } = readLegacyReplayEvidence(row, request)
  assertLegacyObservationReceipt(row, candidate)
  assertLegacyStoredCandidateReceipt(row, candidate, storedJson, requestHash)
  const createdAt = new Date(row.observationCreatedAt as string | number)
  if (!Number.isFinite(createdAt.getTime())) conflict('Legacy provider observation timestamp is invalid.')
  return {
    conflicted: false as const,
    replayed: true,
    receipt: candidate,
    requestHash,
    quarantined: row.runStatus === 'CONFLICT',
    observation: {
      id: String(row.observationId),
      intentId: input.intentId,
      observationKey: input.observationKey,
      kind: String(row.kind),
      requestHash,
      sendBoundaryId: candidate.identity.sendBoundaryId,
      providerNamespace: candidate.identity.providerNamespace,
      threadId: candidate.identity.threadId,
      turnId: candidate.identity.turnId,
      evidenceDigest: String(row.evidenceDigest),
      reconciliationJson: storedJson,
      createdAt,
    },
  }
}

function consumedOutcomeContradictsHistory(
  intent: ProviderIntent,
  candidate: ProviderReconciliationReceipt,
  sourceConflict: boolean,
) {
  return (
    sourceConflict ||
    (intent.reconciledAt && intent.status !== `${candidate.physical.outcome}_RECONCILED`) ||
    (candidate.physical.outcome === 'NONSTART' && intent.acknowledgedAt)
  )
}

async function reconcileConsumedInTransaction(request: ConsumedReconciliationRequest, tx: Prisma.TransactionClient) {
  const { input, candidate, requestHash, sourceConflict } = request
  const intent = await tx.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
    where: { id: input.intentId },
    include: { run: true },
  })
  if (!intent.sendBoundaryId) conflict('Provider intent has no original send boundary.')
  if (candidate) assertConsumedReceiptBoundaryIdentity(candidate, intent)
  const prior = await tx.qualityJourneyProviderObservation.findUnique({
    where: { intentId_observationKey: { intentId: input.intentId, observationKey: input.observationKey } },
  })
  if (prior) {
    if (candidate) assertConsumedReceiptIdentity(candidate, intent)
    return replayConsumedReconciliation(prior, intent, request, tx)
  }
  if (!candidate) conflict('No committed provider reconciliation receipt exists; live proof cannot be reconstructed.')
  if (consumedOutcomeContradictsHistory(intent, candidate, sourceConflict)) {
    await quarantineConsumedReconciliation(intent, candidate, requestHash, tx)
    return { conflicted: true as const }
  }
  assertConsumedReceiptIdentity(candidate, intent)
  assertReconciliationAllowed(intent, candidate.physical.outcome)
  const now = new Date()
  const observation = await tx.qualityJourneyProviderObservation.create({
    data: {
      id: id('qjpo'),
      intentId: intent.id,
      observationKey: input.observationKey,
      kind: candidate.physical.outcome,
      requestHash,
      sendBoundaryId: intent.sendBoundaryId,
      providerNamespace: intent.providerNamespace,
      threadId: candidate.identity.threadId,
      turnId: candidate.identity.turnId,
      evidenceDigest: hash(candidate),
      reconciliationJson: json(candidate),
    },
  })
  await finalizeReconciledProviderIntent(intent, candidate.physical.outcome, now, tx)
  return {
    conflicted: false as const,
    replayed: false,
    observation,
    receipt: candidate,
    requestHash,
    quarantined: false,
  }
}

/** This must be the first statement of the final reconciliation transaction. */
async function lockOriginalSqliteOutcome(custody: SqliteOutcomeCustody, tx: Prisma.TransactionClient) {
  const expected = custody.state
  const locked = await tx.$executeRawUnsafe(
    `UPDATE "QualityJourneyProviderSourceState" SET "commitFenceVersion" = "commitFenceVersion" + 1
     WHERE "sourceId" = ? AND "sourceIncarnation" = ? AND "providerRunId" = ? AND "intentId" = ?
       AND "providerNamespace" = ? AND "identityJson" = ? AND "protocolDigest" = ? AND "qualificationDigest" = ?
       AND "epoch" = ? AND "commitFenceVersion" = ? AND "lifecycle" = 'SEALED' AND "sequence" = ? AND "head" = ? AND "byteCount" = ?
       AND "sealedHead" = ? AND "sealedEnvelopeDigest" = ?
       AND "committedObservationId" IS NULL AND "committedRequestHash" IS NULL
       AND "pendingBatchId" IS NULL AND "pendingBatchStartHead" IS NULL
       AND "pendingBatchRecordAllowance" IS NULL AND "pendingBatchByteAllowance" IS NULL
       AND "pendingBatchRequestDigest" IS NULL`,
    expected.sourceId,
    expected.sourceIncarnation,
    expected.providerRunId,
    expected.intentId,
    expected.providerNamespace,
    expected.identityJson,
    expected.protocolDigest,
    expected.qualificationDigest,
    expected.epoch,
    expected.commitFenceVersion,
    expected.sequence,
    expected.head,
    expected.byteCount,
    expected.sealedHead,
    expected.sealedEnvelopeDigest,
  )
  if (locked !== 1) conflict('Original source outcome custody is no longer current.')
  await custody.assertTransactionSettings(tx)
  const state = await tx.qualityJourneyProviderSourceState.findUniqueOrThrow({
    where: { sourceId: expected.sourceId },
    select: sourceStateSelection,
  })
  const records = await readProviderSourceLedgerRecords(tx, expected.sourceId)
  return { state, records }
}

/** Two independent facts atomically release exactly one consumed original send boundary. */
export async function reconcileConsumedQualityJourneyProviderIntent(
  input: ReconcileConsumedProviderIntentInput,
  context: ProviderReconciliationContext,
  capability: typeof trustedProviderReconciliation,
  client: PrismaClient = prisma,
) {
  if (capability !== trustedProviderReconciliation) unauthorized()
  const capturedContext = captureProviderReconciliationContext(context)
  const capturedInput = Object.freeze({ ...input })
  validateConsumedReconciliationInput(capturedInput)
  const originalReplay = await readOriginalSqliteCommittedReplay(capturedInput, capturedContext, client)
  if (originalReplay) return originalReplay
  rejectUnmatchedOwnedReplayRequest(capturedInput, client)
  const request = consumedReconciliationRequest(capturedInput, capturedContext)
  const ownedClient = providerSourceDatabaseIsOwned(client)
  if (isOwnedLegacyReconciliation(ownedClient, request)) {
    const snapshot = await readProviderSourceCommittedSnapshot(
      providerSourceDatabaseFor(client),
      capturedInput.intentId,
      capturedInput.observationKey,
    )
    if (!snapshot) conflict('No exact committed legacy provider reconciliation exists.')
    return replayLegacyConsumedSnapshot(snapshot, request)
  }
  // Exact durable replay takes no fresh source custody and never repeats physical release.
  const prior = ownedClient
    ? null
    : await client.qualityJourneyProviderObservation.findUnique({
        where: { intentId_observationKey: { intentId: input.intentId, observationKey: input.observationKey } },
      })
  if (!request.candidate || prior) {
    const result = await client.$transaction(tx => reconcileConsumedInTransaction(request, tx))
    if (result.conflicted)
      conflict('Provider reconciliation conflicts with retained physical evidence; hub remains quarantined.')
    await resolveOriginalSqliteRetirementFromReplay(client, input.intentId, input.observationKey, request.requestHash)
    return result
  }
  return reconcileFreshOriginalConsumedIntent(input, capturedInput, capturedContext, request, client, request.candidate)
}

/** The fresh original source path retains its actual transaction Promise through completion or ambiguity. */
async function reconcileFreshOriginalConsumedIntent(
  input: ReconcileConsumedProviderIntentInput,
  capturedInput: Readonly<ReconcileConsumedProviderIntentInput>,
  capturedContext: ReturnType<typeof captureProviderReconciliationContext>,
  request: ReturnType<typeof consumedReconciliationRequest>,
  client: PrismaClient,
  candidate: ProviderReconciliationReceipt,
) {
  if (!capturedContext.source || !input.senderExcluded) conflict('Original source custody is required.')
  const custody = acquireOriginalSqliteOutcomeCustody(
    capturedContext.source,
    input.physicalEvidence,
    input.senderExcluded,
    client,
    candidate,
    Object.freeze({ observationKey: capturedInput.observationKey, requestHash: request.requestHash }),
  )
  let entered = false
  let engineOperation: Promise<Awaited<ReturnType<typeof reconcileConsumedInTransaction>>> | undefined
  let result: Awaited<ReturnType<typeof reconcileConsumedInTransaction>>
  try {
    engineOperation = client.$transaction(async tx => {
      if (entered) conflict('Provider reconciliation transaction callback may only enter once.')
      entered = true
      const locked = await lockOriginalSqliteOutcome(custody, tx)
      custody.verifyLocked(locked.state, locked.records)
      const result = await reconcileConsumedInTransaction(request, tx)
      if (result.conflicted) {
        await tx.qualityJourneyProviderSourceState.update({
          where: { sourceId: custody.state.sourceId },
          data: { lifecycle: 'REVOKED' },
        })
      } else {
        await tx.qualityJourneyProviderSourceState.update({
          where: { sourceId: custody.state.sourceId },
          data: {
            lifecycle: 'COMMITTED',
            committedObservationId: result.observation.id,
            committedRequestHash: result.requestHash,
          },
        })
      }
      return result
    })
    result = await engineOperation
  } catch (error) {
    custody.retire(engineOperation)
    const replay = await custody.tryResolveCommittedReplay()
    if (replay) return replay
    throw error
  }
  custody.completeFulfilled()
  if (result.conflicted)
    conflict('Provider reconciliation conflicts with retained physical evidence; hub remains quarantined.')
  return result
}

/** An explicit owned replay request cannot fall through to a fresh physical reconciliation. */
function rejectUnmatchedOwnedReplayRequest(
  capturedInput: Readonly<ReconcileConsumedProviderIntentInput>,
  client: PrismaClient,
): void {
  if (capturedInput.replayRequestHash && providerSourceDatabaseIsOwned(client))
    conflict('No exact committed provider reconciliation exists in the clean replay resolver.')
}

/** Select the existing clean resolver route for the legacy source dialect. */
function isOwnedLegacyReconciliation(ownedClient: boolean, request: ConsumedReconciliationRequest): boolean {
  return ownedClient && request.candidate?.physical.protocolDigest !== sqliteOutcomeSourceProtocolDigest
}
