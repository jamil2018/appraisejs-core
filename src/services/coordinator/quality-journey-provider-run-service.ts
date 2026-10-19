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
import { validateWorkerSpawnReceipt } from '@/lib/quality-journey'
import {
  assertProviderSenderDisabled,
  createProviderSendPermit,
  consumeProviderSendPermit,
  providerIntentPolicy,
  trustedProviderObservation,
  trustedProviderArm,
  trustedProviderReconciliation,
  type ProviderSenderDisabled,
  type ProviderSendPermit,
} from '@/lib/quality-journey/provider-intent-contract'
import { ServiceError } from '@/services/shared/errors'
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

type HistoricalDispatch = Prisma.QualityJourneyWorkAttemptGetPayload<{
  select: {
    id: true
    workItemId: true
    assignmentId: true
    status: true
    spawnRequestJson: true
    spawnRequestHash: true
    spawnReceiptJson: true
    spawnReceiptHash: true
  }
}>

function readHistoricalDispatchEvidence(attempt: HistoricalDispatch) {
  if (!attempt.spawnRequestJson || !attempt.spawnRequestHash || !attempt.spawnReceiptJson || !attempt.spawnReceiptHash)
    return null
  const request = JSON.parse(attempt.spawnRequestJson) as Record<string, unknown>
  const receipt = JSON.parse(attempt.spawnReceiptJson) as Record<string, unknown>
  if (hash(request) !== attempt.spawnRequestHash || hash(receipt) !== attempt.spawnReceiptHash) return null
  return { request, receipt }
}

function isProvenHistoricalNonstart(attempt: HistoricalDispatch) {
  if (attempt.status !== 'REFUSED') return false
  try {
    const evidence = readHistoricalDispatchEvidence(attempt)
    if (!evidence) return false
    const request = evidence.request
    if (
      request.attemptId !== attempt.id ||
      request.workItemId !== attempt.workItemId ||
      request.assignmentId !== attempt.assignmentId
    )
      return false
    return validateWorkerSpawnReceipt(evidence.receipt, request).outcome === 'REFUSED'
  } catch {
    return false
  }
}

async function assertHistoricalHubQuiescent(tx: Prisma.TransactionClient) {
  const conflictingRun = await tx.qualityJourneyProviderRun.findFirst({
    where: { status: 'CONFLICT' },
    select: { id: true },
  })
  if (conflictingRun) conflict('Conflicting provider evidence requires reconciliation before hub reuse.')
  const historical = await tx.qualityJourneyWorkAttempt.findMany({
    where: {
      providerRun: null,
      OR: [
        { dispatchReservedAt: { not: null } },
        { dispatchStartedAt: { not: null } },
        { status: 'DISPATCH_UNRESOLVED' },
      ],
    },
    select: {
      id: true,
      workItemId: true,
      assignmentId: true,
      status: true,
      spawnRequestJson: true,
      spawnRequestHash: true,
      spawnReceiptJson: true,
      spawnReceiptHash: true,
    },
  })
  if (historical.some(attempt => !isProvenHistoricalNonstart(attempt)))
    conflict('Historical provider dispatch requires reconciliation before hub reuse.')
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
    await tx.qualityJourneyProviderDispatchIntent.update({
      where: { id: intent.id },
      data: { reconciledAt: now, status: `${input.outcome}_RECONCILED` },
    })
    await tx.qualityJourneyProviderRun.update({
      where: { id: intent.run.id },
      data: {
        status: `${input.outcome}_RECONCILED`,
        terminalReconciledAt: now,
        terminalRetentionAt: after(now, providerIntentPolicy.terminalRetentionSeconds),
      },
    })
    const released = await tx.qualityJourneyProviderSlot.updateMany({
      where: { id: 'HUB', providerRunId: intent.run.id, intentId: intent.id, sendBoundaryId: intent.sendBoundaryId },
      data: { providerRunId: null, intentId: null, sendBoundaryId: null, reservedAt: null, version: { increment: 1 } },
    })
    if (released.count !== 1) conflict('Provider hub slot no longer binds exact reconciliation identity.')
    return { replayed: false, observation }
  })
}
