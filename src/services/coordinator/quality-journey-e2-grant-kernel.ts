import type { Prisma } from '@prisma/client'

import { canonicalE2Json, e2EnvelopeDigest, e2Sha256, isE2Digest, isE2Id, isE2Uint,
  parseE2FiniteEnvelope, prechargeE2Actor, type E2ActorTotals, type E2FiniteEnvelope,
  type E2SetupStage } from '@/lib/quality-journey/provider-grant-contract'
import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import {
  E2_CAMPAIGN_POLICY_DOMAIN,
  e2CampaignPolicyCounterCaps as policyCapFields,
  validateE2CampaignPolicyRow,
  type E2CampaignPolicyRow,
} from '@/lib/quality-journey/e2-campaign-policy-contract'
import { providerIntentPolicy } from '@/lib/quality-journey/provider-intent-contract'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession, type CoordinatorSessionBinding } from
  './quality-journey-coordinator-session'

/** Actual supported-Prisma transaction kernel. Its rows and return value are inert; no issuer is enrolled here. */
const refused: (reason: string) => never = reason => {
  throw new ServiceError(`E2 grant refused: ${reason}.`, 'CONFLICT')
}
const date = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const maxEpoch = BigInt('8640000000000000')
type Policy = E2CampaignPolicyRow
type Preparation = {
  id: string; journeyId: string; targetProjectId: string; coordinatorSessionId: string;
  generation: number; providerRunId: string; intentId: string; campaignPolicyId: string;
  operationId: string; kind: string; setupStage: string | null; sourceTupleDigest: string;
  requestDigest: string; envelopeDigest: string; sourceEventDigest: string;
  preparedAtEpochMs: bigint; windowDurationMs: number; windowDueAtEpochMs: bigint
}
type Retirement = { id: string; journeyId: string; targetProjectId: string;
  coordinatorSessionId: string; generation: number; campaignPolicyId: string | null;
  state: string; version: number; requestId: string | null; requestedAt: Date | null;
  requestReason: string | null; effectiveAt: Date | null; effectiveEvidenceDigest: string | null }
type Journey = { id: string; targetProjectId: string; currentCoordinatorSessionId: string | null;
  hostingMode: string; status: string; ownershipVersion: number; e2AdmissionVersion: number;
  e2NativeStartsReserved: number; e2TurnStartsReserved: number }
type Session = { id: string; journeyId: string; targetProjectId: string; generation: number | null;
  status: string; fencedAt: Date | null; e2EnrollmentKind: string | null;
  e2EnrollmentDigest: string | null; e2EnrolledAt: Date | null }
type Attempt = { id: string; workItemId: string; authorizationId: string | null;
  leaseId: string; assignmentGeneration: number; attempt: number; status: string;
  cancelledAt: Date | null; leaseExpiresAt: Date; workItem: { id: string;
    journeyId: string; targetProjectId: string; status: string; currentAttempt: number } }
type Authorization = { id: string; journeyId: string; targetProjectId: string;
  workItemId: string; maxAttempts: number; cancelledAt: Date | null; revokedAt: Date | null;
  successorAuthorization: { id: string } | null }
type Run = { id: string; journeyId: string; targetProjectId: string; sessionId: string;
  coordinatorGeneration: number; attemptId: string; authorizationId: string; leaseId: string;
  assignmentGeneration: number; status: string; unresolvedRetentionAt: Date;
  terminalRetentionAt: Date | null; terminalReconciledAt: Date | null;
  turnsReserved: number; policyJson: string }
type Intent = { id: string; providerRunId: string; status: string; claimOwner: string | null;
  claimEpoch: number; claimExpiresAt: Date | null; invalidatedAt: Date | null;
  acknowledgementDueAt: Date | null; turnDueAt: Date | null; acknowledgedAt: Date | null;
  sendBoundaryId: string | null; reconciledAt: Date | null; createdAt: Date }
type Slot = { id: string; providerRunId: string | null; intentId: string | null;
  sendBoundaryId: string | null; version: number }
type Actor = { id: string; providerRunId: string; journeyId: string; targetProjectId: string;
  coordinatorSessionId: string; generation: number; intentId: string; slotId: string;
  sourceTupleDigest: string; constructorDigest: string; parentIncarnationDigest: string;
  prospectiveChildNonceDigest: string; privateChannelDigest: string;
  originalChildIncarnationDigest: string | null; state: string; operationsReserved: number;
  bytesReserved: number; framesReserved: number; setupReserved: number;
  providerRequestsReserved: number; mcpCallsReserved: number; recoveryControlsReserved: number }
type Grant = { id: string; providerRunId: string; actorCustodyId: string; intentId: string;
  operationId: string; sequence: number; kind: string; setupStage: string | null;
  sourceTupleDigest: string; requestDigest: string; envelopeDigest: string;
  operationPreparationId: string | null; admissionVersion: number;
  journeyId: string; targetProjectId: string; coordinatorSessionId: string; generation: number;
  attemptId: string; authorizationId: string; leaseId: string; assignmentGeneration: number;
  rangeId: string; parentOperationId: string | null; payloadDigest: string | null;
  payloadByteLength: number | null; payloadReceiveTimeoutMs: number | null;
  maxBytes: number; maxFrames: number; maxControlFrames: number; maxDescendants: number }
type Delegate<Row> = { findUnique(args: Record<string, unknown>): Promise<Row | null>;
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  create(args: Record<string, unknown>): Promise<Row> }
type KernelDb = {
  qualityJourney: Delegate<Journey>; qualityJourneyCoordinatorSession: Delegate<Session>;
  qualityJourneyE2Retirement: Delegate<Retirement>; qualityJourneyE2CampaignPolicy: Delegate<Policy>;
  qualityJourneyE2OperationPreparation: Delegate<Preparation>;
  qualityJourneyWorkAttempt: Delegate<Attempt>; qualityJourneyWorkAuthorization: Delegate<Authorization>;
  qualityJourneyProviderRun: Delegate<Run>; qualityJourneyProviderDispatchIntent: Delegate<Intent>;
  qualityJourneyProviderSlot: Delegate<Slot>; qualityJourneyE2ActorCustody: Delegate<Actor>;
  qualityJourneyE2Grant: Delegate<Grant>
}

export type E2KernelRequest = Readonly<{
  journeyId: string; targetProjectId: string; coordinatorSessionId: string; generation: number;
  credentials: CoordinatorSessionBinding; providerRunId: string; intentId: string;
  attemptId: string; authorizationId: string; leaseId: string; assignmentGeneration: number;
  requestDigest: string; envelope: E2FiniteEnvelope; claimOwner: string; claimEpoch: number
}>
/** Private issuer expectations in production; offline adapter supplies inert synthetic values only. */
export type E2KernelExpectedCustody = Readonly<{
  campaignPolicyId: string; allocationDigest: string; policyDigest: string;
  providerIntentPolicyDigest: string;
  sourceEventDigest: string; constructorDigest: string; parentIncarnationDigest: string;
  prospectiveChildNonceDigest: string; privateChannelDigest: string;
  actorCustodyId: string; originalChildIncarnationDigest: string | null
}>
export type E2KernelFreshIds = Readonly<{ grantId: string; handoffId: string;
  sendBoundaryId: string; retirementRequestId: string }>
export type E2KernelResult =
  | Readonly<{ status: 'READ_ONLY_RECEIPT'; receipt: { operationId: string;
    requestDigest: string; envelopeDigest: string; commitReceiptDigest: string } }>
  | Readonly<{ status: 'DB_COMMITTED_INERT'; outcome: 'GRANT' | 'RETIREMENT_REQUEST';
    operationId: string; eligibilitySampleAt: Date; earliestDueAt: Date;
    dueAtSourceDigest: string; admissionVersion: number;
    commitReceiptDigest?: string; retirementReason?: string }>

const E2_PREPARATION_DOMAIN = 'M06_E2_PREPARATION_V1' as const
const E2_DUE_SOURCE_DOMAIN = 'M06_E2_DUE_AT_SOURCES_V2' as const
const E2_COMMIT_RECEIPT_DOMAIN = 'M06_E2_COMMIT_RECEIPT_V1' as const
/** Fixed E1 policy identity: the separately qualified issuer must pin this exact artifact. */
export const E2_REVIEWED_PROVIDER_INTENT_POLICY_JSON = canonicalContractJson(providerIntentPolicy)
export const E2_REVIEWED_PROVIDER_INTENT_POLICY_DIGEST =
  e2Sha256(E2_REVIEWED_PROVIDER_INTENT_POLICY_JSON)

export function e2KernelPreparationId(campaignPolicyId: string, providerRunId: string,
  operationId: string): string {
  if (![campaignPolicyId, providerRunId, operationId].every(isE2Id)) refused('preparation ID input')
  return e2Sha256(canonicalE2Json({ campaignPolicyId, providerRunId, operationId }),
    `${E2_PREPARATION_DOMAIN}\n`)
}
function receiptDigest(grant: Grant): string {
  return e2Sha256(canonicalE2Json({ grantId: grant.id, providerRunId: grant.providerRunId,
    operationId: grant.operationId, requestDigest: grant.requestDigest,
    envelopeDigest: grant.envelopeDigest, admissionVersion: grant.admissionVersion,
    operationPreparationId: grant.operationPreparationId }), `${E2_COMMIT_RECEIPT_DOMAIN}\n`)
}
function exactId(value: unknown): asserts value is string { if (!isE2Id(value)) refused('identifier') }
function exactDigest(value: unknown): asserts value is string { if (!isE2Digest(value)) refused('digest') }
function count(result: { count: number }, description: string) {
  if (result.count !== 1) refused(`${description} CAS`)
}
function policyDuration(policy: Policy, envelope: E2FiniteEnvelope): number {
  const field = envelope.kind === 'NATIVE_START' ? 'nativeStartWindowMs' :
    envelope.kind === 'PROVIDER_REQUEST' ? 'providerRequestWindowMs' :
      envelope.kind === 'MCP_CALL' ? 'mcpCallWindowMs' :
        envelope.setupStage === 'DNS' ? 'dnsWindowMs' :
          envelope.setupStage === 'TCP' ? 'tcpWindowMs' :
            envelope.setupStage === 'TLS' ? 'tlsWindowMs' : 'upgradeWindowMs'
  const value = policy[field]
  if (!isE2Uint(value, 2_147_483_646) || value === 0) refused('policy duration')
  return value
}
function validatePolicy(policy: Policy, request: E2KernelRequest, expected: E2KernelExpectedCustody) {
  try { validateE2CampaignPolicyRow(policy) } catch { refused('campaign policy shape or digest') }
  if (policy.id !== expected.campaignPolicyId || policy.journeyId !== request.journeyId ||
    policy.targetProjectId !== request.targetProjectId ||
    policy.sourceTupleDigest !== request.envelope.sourceTupleDigest ||
    policy.policyVersion !== E2_CAMPAIGN_POLICY_DOMAIN ||
    policy.allocationDigest !== expected.allocationDigest ||
    policy.policyDigest !== expected.policyDigest ||
    !isE2Uint(policy.version, 2_147_483_645)) refused('campaign policy identity')
}
function validatePreparation(prep: Preparation, request: E2KernelRequest,
  expected: E2KernelExpectedCustody, policy: Policy, envelopeDigest: string): Date {
  const envelope = request.envelope
  if (prep.id !== e2KernelPreparationId(policy.id, request.providerRunId, envelope.operationId) ||
    prep.journeyId !== request.journeyId || prep.targetProjectId !== request.targetProjectId ||
    prep.coordinatorSessionId !== request.coordinatorSessionId || prep.generation !== request.generation ||
    prep.providerRunId !== request.providerRunId || prep.intentId !== request.intentId ||
    prep.campaignPolicyId !== policy.id || prep.operationId !== envelope.operationId ||
    prep.kind !== envelope.kind || prep.setupStage !== envelope.setupStage ||
    prep.sourceTupleDigest !== envelope.sourceTupleDigest || prep.requestDigest !== request.requestDigest ||
    prep.envelopeDigest !== envelopeDigest || prep.sourceEventDigest !== expected.sourceEventDigest ||
    prep.windowDurationMs !== policyDuration(policy, envelope) ||
    typeof prep.preparedAtEpochMs !== 'bigint' || prep.preparedAtEpochMs < BigInt(0) ||
    prep.preparedAtEpochMs > maxEpoch || typeof prep.windowDueAtEpochMs !== 'bigint' ||
    prep.windowDueAtEpochMs < BigInt(0) || prep.windowDueAtEpochMs > maxEpoch ||
    prep.windowDueAtEpochMs !== prep.preparedAtEpochMs + BigInt(prep.windowDurationMs))
    refused('operation preparation')
  const due = Number(prep.windowDueAtEpochMs)
  if (!Number.isSafeInteger(due) || !date(new Date(due))) refused('preparation due-at')
  return new Date(due)
}
function costs(envelope: E2FiniteEnvelope) {
  return { nativeStartsReserved: Number(envelope.kind === 'NATIVE_START'),
    providerRequestsReserved: Number(envelope.kind === 'PROVIDER_REQUEST'),
    operationsReserved: 1, bytesReserved: envelope.maxBytes, framesReserved: envelope.maxFrames,
    setupReserved: Number(envelope.kind === 'SETUP'), mcpCallsReserved: Number(envelope.kind === 'MCP_CALL') }
}
function validateCosts(policy: Policy, actorTotals: E2ActorTotals, envelope: E2FiniteEnvelope) {
  const charges = costs(envelope)
  for (const [counter, cap] of policyCapFields)
    if (policy[counter] + charges[counter] > policy[cap]) refused('campaign budget')
  if (actorTotals.operationsReserved > policy.actorMaxOperations ||
    actorTotals.bytesReserved > policy.actorMaxBytes ||
    actorTotals.framesReserved > policy.actorMaxFrames ||
    actorTotals.setupReserved > policy.actorMaxSetup ||
    actorTotals.providerRequestsReserved > policy.actorMaxProviderRequests ||
    actorTotals.mcpCallsReserved > policy.actorMaxMcpCalls) refused('actor policy budget')
  return charges
}
type DeadlineSource = { field: string; ownerId: string; persistedEpochMs: number }
function deadlineEvidence(sources: DeadlineSource[], intentId: string, intentCreatedAt: Date,
  providerIntentPolicyDigest: string) {
  const ordered = [...sources].sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0)
  if (new Set(ordered.map(source => source.field)).size !== ordered.length) refused('deadline duplication')
  const earliest = Math.min(...ordered.map(source => source.persistedEpochMs))
  if (!Number.isSafeInteger(earliest) || earliest < 0 || earliest > Number(maxEpoch)) refused('deadline range')
  return { earliestDueAt: new Date(earliest), dueAtSourceDigest: e2Sha256(canonicalE2Json({
    sources: ordered,
    intentPreparationAnchor: { ownerId: intentId, persistedEpochMs: intentCreatedAt.getTime() },
    providerIntentPolicyDigest,
  }),
    `${E2_DUE_SOURCE_DOMAIN}\n`), earliestField: ordered.find(source =>
    source.persistedEpochMs === earliest)!.field }
}
function deadline(field: string, ownerId: string, value: Date): DeadlineSource {
  exactId(ownerId)
  if (!date(value) || !Number.isSafeInteger(value.getTime()) || value.getTime() < 0)
    refused('persisted deadline')
  return { field, ownerId, persistedEpochMs: value.getTime() }
}

/**
 * Must be called inside one caller-owned Prisma transaction. A `DB_COMMITTED_INERT` callback value is not
 * an outer-commit or physical-effect proof; only the caller's awaited outer fulfillment can report commit.
 * Every write remains atomic with that outer transaction. No retry or second clock sample occurs here.
 */
export async function applyInertE2GrantSqlKernel(tx: Prisma.TransactionClient, request: E2KernelRequest,
  expected: E2KernelExpectedCustody, ids: E2KernelFreshIds,
  sampleFinalClock: () => Date): Promise<E2KernelResult> {
  const db = tx as unknown as KernelDb
  let envelope: E2FiniteEnvelope
  try { envelope = parseE2FiniteEnvelope(request.envelope) } catch { refused('finite envelope') }
  const envelopeDigest = e2EnvelopeDigest(envelope)
  for (const value of [request.journeyId, request.targetProjectId, request.coordinatorSessionId,
    request.providerRunId, request.intentId, request.attemptId, request.authorizationId,
    request.leaseId, request.claimOwner, ids.grantId, ids.handoffId, ids.sendBoundaryId,
    ids.retirementRequestId, expected.campaignPolicyId, expected.actorCustodyId]) exactId(value)
  for (const value of [request.requestDigest, expected.allocationDigest, expected.policyDigest,
    expected.providerIntentPolicyDigest,
    expected.sourceEventDigest, expected.constructorDigest, expected.parentIncarnationDigest,
    expected.prospectiveChildNonceDigest, expected.privateChannelDigest]) exactDigest(value)
  if (expected.originalChildIncarnationDigest !== null) exactDigest(expected.originalChildIncarnationDigest)
  if (!isE2Uint(request.generation) || request.generation < 1 ||
    !isE2Uint(request.assignmentGeneration) || request.assignmentGeneration < 1 ||
    !isE2Uint(request.claimEpoch) || request.credentials.journeyId !== request.journeyId ||
    request.credentials.targetProjectId !== request.targetProjectId ||
    request.credentials.coordinatorSessionId !== request.coordinatorSessionId ||
    request.credentials.coordinatorGeneration !== request.generation ||
    envelope.runId !== request.providerRunId || envelope.intentId !== request.intentId)
    refused('request lineage')

  // Query immutable operation identity first; neither a row nor its receipt is authority to dispatch.
  const duplicateRows = await db.qualityJourneyE2Grant.findMany({
    where: { providerRunId: request.providerRunId, operationId: envelope.operationId }, take: 2 })
  if (duplicateRows.length > 1) refused('duplicate grant corruption')
  const current = await assertCurrentCoordinatorSession(request.credentials, tx)
  const journey = current.journey as unknown as Journey
  const session = current.session as Session | null
  if (!session || session.id !== request.coordinatorSessionId ||
    session.generation !== request.generation || session.status !== 'ACTIVE' || session.fencedAt ||
    session.e2EnrollmentKind !== 'E2_V1' || !isE2Digest(session.e2EnrollmentDigest) ||
    !date(session.e2EnrolledAt) || session.e2EnrollmentDigest !== envelope.sourceTupleDigest ||
    journey.id !== request.journeyId || journey.targetProjectId !== request.targetProjectId ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.currentCoordinatorSessionId !== session.id) refused('session enrollment')
  const [policyRows, retirementRows, prepRows, attempt, authorization, run, intent, slot, actor] = await Promise.all([
    db.qualityJourneyE2CampaignPolicy.findMany({ where: { journeyId: journey.id,
      targetProjectId: journey.targetProjectId }, take: 2 }),
    db.qualityJourneyE2Retirement.findMany({ where: { coordinatorSessionId: session.id,
      generation: request.generation }, take: 2 }),
    db.qualityJourneyE2OperationPreparation.findMany({ where: {
      providerRunId: request.providerRunId, operationId: envelope.operationId }, take: 2 }),
    db.qualityJourneyWorkAttempt.findUnique({ where: { id: request.attemptId },
      include: { workItem: true } }),
    db.qualityJourneyWorkAuthorization.findUnique({ where: { id: request.authorizationId },
      include: { successorAuthorization: true } }),
    db.qualityJourneyProviderRun.findUnique({ where: { id: request.providerRunId } }),
    db.qualityJourneyProviderDispatchIntent.findUnique({ where: { id: request.intentId } }),
    db.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } }),
    db.qualityJourneyE2ActorCustody.findUnique({ where: { providerRunId: request.providerRunId } }),
  ])
  if (policyRows.length !== 1 || retirementRows.length !== 1 || prepRows.length !== 1 ||
    !attempt || !authorization || !run || !intent || !slot) refused('required exact row missing')
  const policy = policyRows[0]!
  const retirement = retirementRows[0]!
  const prep = prepRows[0]!
  validatePolicy(policy, request, expected)
  const prepDue = validatePreparation(prep, request, expected, policy, envelopeDigest)
  if (run.policyJson !== E2_REVIEWED_PROVIDER_INTENT_POLICY_JSON ||
    expected.providerIntentPolicyDigest !== E2_REVIEWED_PROVIDER_INTENT_POLICY_DIGEST)
    refused('reviewed provider intent policy identity')
  if (retirement.journeyId !== journey.id || retirement.targetProjectId !== journey.targetProjectId ||
    retirement.coordinatorSessionId !== session.id || retirement.generation !== request.generation ||
    retirement.campaignPolicyId !== policy.id || !isE2Uint(retirement.version, 2_147_483_645))
    refused('retirement policy lineage')
  if (attempt.id !== request.attemptId || attempt.authorizationId !== request.authorizationId ||
    attempt.leaseId !== request.leaseId || attempt.assignmentGeneration !== request.assignmentGeneration ||
    attempt.workItem.id !== attempt.workItemId ||
    attempt.workItem.journeyId !== journey.id ||
    attempt.workItem.targetProjectId !== journey.targetProjectId ||
    attempt.workItem.currentAttempt !== attempt.attempt ||
    authorization.id !== request.authorizationId || authorization.journeyId !== journey.id ||
    authorization.targetProjectId !== journey.targetProjectId ||
    authorization.workItemId !== attempt.workItemId ||
    run.id !== request.providerRunId || run.journeyId !== journey.id ||
    run.targetProjectId !== journey.targetProjectId || run.sessionId !== session.id ||
    run.coordinatorGeneration !== request.generation || run.attemptId !== attempt.id ||
    run.authorizationId !== authorization.id || run.leaseId !== request.leaseId ||
    run.assignmentGeneration !== request.assignmentGeneration ||
    intent.id !== request.intentId || intent.providerRunId !== run.id || slot.id !== 'HUB')
    refused('attempt authorization run intent lineage')
  const duplicate = duplicateRows[0]
  if (duplicate) {
    if (duplicate.providerRunId !== run.id || duplicate.intentId !== intent.id ||
      duplicate.operationId !== envelope.operationId || duplicate.requestDigest !== request.requestDigest ||
      duplicate.envelopeDigest !== envelopeDigest || duplicate.operationPreparationId !== prep.id ||
      duplicate.journeyId !== journey.id || duplicate.targetProjectId !== journey.targetProjectId ||
      duplicate.coordinatorSessionId !== session.id || duplicate.generation !== request.generation ||
      duplicate.attemptId !== attempt.id || duplicate.authorizationId !== authorization.id ||
      duplicate.leaseId !== request.leaseId ||
      duplicate.assignmentGeneration !== request.assignmentGeneration ||
      duplicate.actorCustodyId !== expected.actorCustodyId ||
      duplicate.sequence !== envelope.sequence || duplicate.kind !== envelope.kind ||
      duplicate.setupStage !== envelope.setupStage ||
      duplicate.sourceTupleDigest !== envelope.sourceTupleDigest ||
      duplicate.rangeId !== envelope.rangeId ||
      duplicate.parentOperationId !== envelope.parentOperationId ||
      duplicate.payloadDigest !== envelope.payloadDigest ||
      duplicate.payloadByteLength !== envelope.payloadByteLength ||
      duplicate.payloadReceiveTimeoutMs !== envelope.payloadReceiveTimeoutMs ||
      duplicate.maxBytes !== envelope.maxBytes || duplicate.maxFrames !== envelope.maxFrames ||
      duplicate.maxControlFrames !== envelope.maxControlFrames ||
      duplicate.maxDescendants !== envelope.maxDescendants ||
      !isE2Id(duplicate.id) || !isE2Uint(duplicate.admissionVersion)) refused('duplicate mismatch')
    return { status: 'READ_ONLY_RECEIPT', receipt: { operationId: envelope.operationId,
      requestDigest: request.requestDigest, envelopeDigest, commitReceiptDigest: receiptDigest(duplicate) } }
  }
  if (retirement.state !== 'ACTIVE' || retirement.requestId !== null ||
    retirement.requestedAt !== null || retirement.requestReason !== null ||
    retirement.effectiveAt !== null || retirement.effectiveEvidenceDigest !== null)
    refused('retirement requested or corrupt')
  if (journey.status !== 'ACTIVE' || attempt.status !== 'IN_PROGRESS' ||
    attempt.workItem.status !== 'IN_PROGRESS' || attempt.cancelledAt ||
    !isE2Uint(attempt.attempt, 3) || attempt.attempt < 1 ||
    !isE2Uint(authorization.maxAttempts, 3) || attempt.attempt > authorization.maxAttempts ||
    authorization.cancelledAt || authorization.revokedAt || authorization.successorAuthorization ||
    intent.invalidatedAt || intent.reconciledAt || run.terminalReconciledAt ||
    run.terminalRetentionAt || !['PREPARED', 'UNKNOWN', 'ACKNOWLEDGED'].includes(run.status) ||
    !isE2Uint(slot.version, 2_147_483_645) ||
    intent.claimOwner !== request.claimOwner || intent.claimEpoch !== request.claimEpoch)
    refused('exact invalidator or attempt state')
  const start = envelope.kind === 'NATIVE_START'
  let actorId = expected.actorCustodyId
  let actorTotals: E2ActorTotals
  let usedSetupStages: E2SetupStage[] = []
  if (start) {
    if (actor || expected.originalChildIncarnationDigest !== null || run.status !== 'PREPARED' ||
      intent.status !== 'CLAIMED' || intent.claimOwner !== request.claimOwner ||
      intent.claimEpoch !== request.claimEpoch || slot.providerRunId !== null ||
      slot.intentId !== null || slot.sendBoundaryId !== null || intent.sendBoundaryId !== null)
      refused('native start original claim or HUB')
    actorTotals = prechargeE2Actor({ operationsReserved: 0, bytesReserved: 0, framesReserved: 0,
      nativeStartsReserved: 0, setupReserved: 0, providerRequestsReserved: 0,
      mcpCallsReserved: 0, recoveryControlsReserved: 0 }, envelope)
  } else {
    if (!actor || actor.id !== expected.actorCustodyId || actor.providerRunId !== run.id ||
      actor.journeyId !== journey.id || actor.targetProjectId !== journey.targetProjectId ||
      actor.coordinatorSessionId !== session.id || actor.generation !== request.generation ||
      actor.intentId !== intent.id || actor.slotId !== 'HUB' || actor.state !== 'BOUND' ||
      actor.sourceTupleDigest !== envelope.sourceTupleDigest ||
      actor.constructorDigest !== expected.constructorDigest ||
      actor.parentIncarnationDigest !== expected.parentIncarnationDigest ||
      actor.prospectiveChildNonceDigest !== expected.prospectiveChildNonceDigest ||
      actor.privateChannelDigest !== expected.privateChannelDigest ||
      actor.originalChildIncarnationDigest !== expected.originalChildIncarnationDigest ||
      !isE2Digest(actor.originalChildIncarnationDigest) ||
      !['UNKNOWN', 'ACKNOWLEDGED'].includes(run.status) ||
      intent.status !== run.status || slot.providerRunId !== run.id || slot.intentId !== intent.id ||
      !isE2Id(intent.sendBoundaryId) || slot.sendBoundaryId !== intent.sendBoundaryId)
      refused('original bound actor')
    actorId = actor.id
    const prior = await db.qualityJourneyE2Grant.findMany({ where: { actorCustodyId: actor.id },
      orderBy: { sequence: 'asc' }, take: 33 })
    if (prior.length !== actor.operationsReserved || prior.length > 32 ||
      prior.some((grant, index) => grant.sequence !== index || grant.actorCustodyId !== actor.id ||
        grant.providerRunId !== run.id || grant.intentId !== intent.id ||
        grant.sourceTupleDigest !== envelope.sourceTupleDigest)) refused('actor grant sequence')
    usedSetupStages = prior.filter(grant => grant.kind === 'SETUP').map(grant =>
      grant.setupStage as E2SetupStage)
    const parent = prior.find(grant => grant.operationId === envelope.parentOperationId)
    if (!parent || parent.sequence >= envelope.sequence || envelope.sequence !== actor.operationsReserved ||
      (envelope.kind === 'SETUP' && (parent.kind !== 'NATIVE_START' || parent.sequence !== 0)) ||
      (envelope.kind === 'PROVIDER_REQUEST' && parent.kind !== 'SETUP') ||
      (envelope.kind === 'MCP_CALL' && parent.kind !== 'PROVIDER_REQUEST'))
      refused('parent operation')
    actorTotals = prechargeE2Actor({ operationsReserved: actor.operationsReserved,
      bytesReserved: actor.bytesReserved, framesReserved: actor.framesReserved,
      nativeStartsReserved: 1, setupReserved: actor.setupReserved,
      providerRequestsReserved: actor.providerRequestsReserved, mcpCallsReserved: actor.mcpCallsReserved,
      recoveryControlsReserved: actor.recoveryControlsReserved }, envelope, usedSetupStages)
  }
  const charges = validateCosts(policy, actorTotals, envelope)
  if (!isE2Uint(journey.e2AdmissionVersion, 2_147_483_645) ||
    !isE2Uint(journey.ownershipVersion) || !isE2Uint(journey.e2NativeStartsReserved, 6) ||
    !isE2Uint(journey.e2TurnStartsReserved, 5) ||
    journey.e2NativeStartsReserved + charges.nativeStartsReserved > policy.journeyMaxNativeStarts ||
    journey.e2TurnStartsReserved + charges.providerRequestsReserved > policy.journeyMaxTurnStarts ||
    !isE2Uint(run.turnsReserved, providerIntentPolicy.maxTurns) ||
    run.turnsReserved + charges.providerRequestsReserved > providerIntentPolicy.maxTurns)
    refused('Journey or run budget')

  // Intent deadlines are derived from its immutable preparation anchor, never the final sample.
  if (!date(intent.createdAt) || !date(prepDue) || !date(attempt.leaseExpiresAt) ||
    !date(run.unresolvedRetentionAt) ||
    (intent.claimExpiresAt !== null && !date(intent.claimExpiresAt))) refused('persisted deadline')
  const anchor = intent.createdAt.getTime()
  const acknowledgementWindowMs = providerIntentPolicy.acknowledgementSeconds * 1000
  const turnWindowMs = providerIntentPolicy.turnSeconds * 1000
  if (!isE2Uint(acknowledgementWindowMs, 2_147_483_646) ||
    !isE2Uint(turnWindowMs, 2_147_483_646) || acknowledgementWindowMs === 0 ||
    turnWindowMs === 0 || anchor < 0 || !Number.isSafeInteger(anchor) ||
    anchor + turnWindowMs > Number(maxEpoch))
    refused('intent preparation anchor or reviewed windows')
  const ackDue = new Date(anchor + acknowledgementWindowMs)
  const turnDue = new Date(anchor + turnWindowMs)
  const unacknowledged = intent.status === 'CLAIMED' || intent.status === 'UNKNOWN'
  if ((unacknowledged && intent.acknowledgedAt !== null) ||
    (intent.status === 'ACKNOWLEDGED' && !date(intent.acknowledgedAt)) ||
    (!unacknowledged && intent.status !== 'ACKNOWLEDGED'))
    refused('acknowledgement state')
  if (start) {
    if (intent.acknowledgementDueAt !== null || intent.turnDueAt !== null ||
      !date(intent.claimExpiresAt)) refused('start deadline state')
    count(await db.qualityJourneyProviderDispatchIntent.updateMany({
      where: { id: intent.id, providerRunId: run.id, status: 'CLAIMED',
        claimOwner: request.claimOwner, claimEpoch: request.claimEpoch,
        acknowledgementDueAt: null, turnDueAt: null },
      data: { acknowledgementDueAt: ackDue, turnDueAt: turnDue },
    }), 'intent pre-sample deadline')
  } else if (!date(intent.acknowledgementDueAt) || !date(intent.turnDueAt) ||
    intent.acknowledgementDueAt.getTime() !== ackDue.getTime() ||
    intent.turnDueAt.getTime() !== turnDue.getTime()) refused('intent persisted deadline identity')
  const sources: DeadlineSource[] = [deadline('attempt.leaseExpiresAt', attempt.id, attempt.leaseExpiresAt),
    deadline('run.unresolvedRetentionAt', run.id, run.unresolvedRetentionAt),
    deadline('intent.turnDueAt', intent.id, turnDue),
    { field: 'preparation.windowDueAtEpochMs', ownerId: prep.id,
      persistedEpochMs: prepDue.getTime() }]
  // A late acknowledgement cannot renew an already expired ACK window.
  if (unacknowledged || (intent.acknowledgedAt as Date).getTime() >= ackDue.getTime())
    sources.push(deadline('intent.acknowledgementDueAt', intent.id, ackDue))
  if (start && intent.claimExpiresAt) sources.push(deadline('intent.claimExpiresAt', intent.id,
    intent.claimExpiresAt))
  const evidence = deadlineEvidence(sources, intent.id, intent.createdAt,
    expected.providerIntentPolicyDigest)
  // There is deliberately no SQL between this one parent sample and the common Journey CAS.
  const sample = sampleFinalClock()
  if (!date(sample) || !Number.isSafeInteger(sample.getTime()) || sample.getTime() < 0)
    refused('final sample')
  const eligibilitySampleAt = new Date(sample.getTime())
  const expired = sample.getTime() >= evidence.earliestDueAt.getTime()
  count(await db.qualityJourney.updateMany({ where: { id: journey.id,
    targetProjectId: journey.targetProjectId, currentCoordinatorSessionId: session.id,
    ownershipVersion: journey.ownershipVersion, e2AdmissionVersion: journey.e2AdmissionVersion,
    status: 'ACTIVE', hostingMode: journey.hostingMode,
    e2NativeStartsReserved: journey.e2NativeStartsReserved,
    e2TurnStartsReserved: journey.e2TurnStartsReserved },
  data: { e2AdmissionVersion: { increment: 1 },
    ...(!expired && charges.nativeStartsReserved ? { e2NativeStartsReserved: { increment: 1 } } : {}),
    ...(!expired && charges.providerRequestsReserved ? { e2TurnStartsReserved: { increment: 1 } } : {}) },
  }), 'Journey admission')
  const admissionVersion = journey.e2AdmissionVersion + 1
  if (expired) {
    const retirementReason = evidence.earliestField === 'attempt.leaseExpiresAt' ? 'LEASE_EXPIRED' :
      evidence.earliestField === 'run.unresolvedRetentionAt' ? 'RUN_RETENTION_EXPIRED' :
        evidence.earliestField.startsWith('intent.') ? 'INTENT_DEADLINE_EXPIRED' : 'SOURCE_FAILURE'
    count(await db.qualityJourneyE2Retirement.updateMany({ where: { id: retirement.id,
      journeyId: journey.id, targetProjectId: journey.targetProjectId,
      coordinatorSessionId: session.id, generation: request.generation,
      campaignPolicyId: policy.id, state: 'ACTIVE', version: retirement.version,
      requestId: null, requestedAt: null, requestReason: null },
    data: { state: 'RETIRE_REQUESTED', requestId: ids.retirementRequestId,
      requestedAt: eligibilitySampleAt, requestReason: retirementReason,
      version: { increment: 1 } } }), 'expiry latch')
    return { status: 'DB_COMMITTED_INERT', outcome: 'RETIREMENT_REQUEST',
      operationId: envelope.operationId, eligibilitySampleAt,
      earliestDueAt: evidence.earliestDueAt, dueAtSourceDigest: evidence.dueAtSourceDigest,
      admissionVersion, retirementReason }
  }
  const campaignWhere: Record<string, unknown> = { id: policy.id, version: policy.version,
    journeyId: journey.id, targetProjectId: journey.targetProjectId,
    sourceTupleDigest: envelope.sourceTupleDigest }
  const campaignData: Record<string, unknown> = { version: { increment: 1 } }
  for (const [counter] of policyCapFields) {
    campaignWhere[counter] = policy[counter]
    if (charges[counter]) campaignData[counter] = { increment: charges[counter] }
  }
  count(await db.qualityJourneyE2CampaignPolicy.updateMany({ where: campaignWhere,
    data: campaignData }), 'campaign budget')
  if (start) {
    await db.qualityJourneyE2ActorCustody.create({ data: {
      id: actorId, providerRunId: run.id, journeyId: journey.id,
      targetProjectId: journey.targetProjectId, coordinatorSessionId: session.id,
      generation: request.generation, intentId: intent.id, slotId: 'HUB',
      sourceTupleDigest: envelope.sourceTupleDigest, constructorDigest: expected.constructorDigest,
      parentIncarnationDigest: expected.parentIncarnationDigest,
      prospectiveChildNonceDigest: expected.prospectiveChildNonceDigest,
      privateChannelDigest: expected.privateChannelDigest,
      state: 'PRESPAWN_COMMITTED', operationsReserved: 1,
      bytesReserved: 0, framesReserved: 0, setupReserved: 0,
      providerRequestsReserved: 0, mcpCallsReserved: 0, recoveryControlsReserved: 0,
    } })
    count(await db.qualityJourneyProviderSlot.updateMany({ where: { id: 'HUB',
      providerRunId: null, intentId: null, sendBoundaryId: null, version: slot.version },
    data: { providerRunId: run.id, intentId: intent.id, sendBoundaryId: ids.sendBoundaryId,
      reservedAt: eligibilitySampleAt, version: { increment: 1 } } }), 'HUB occupancy')
    count(await db.qualityJourneyProviderRun.updateMany({ where: { id: run.id,
      status: 'PREPARED', turnsReserved: run.turnsReserved }, data: { status: 'UNKNOWN' } }), 'run UNKNOWN')
    count(await db.qualityJourneyProviderDispatchIntent.updateMany({ where: { id: intent.id,
      providerRunId: run.id, status: 'CLAIMED', claimOwner: request.claimOwner,
      claimEpoch: request.claimEpoch, sendBoundaryId: null },
    data: { status: 'UNKNOWN', sendBoundaryId: ids.sendBoundaryId,
      armedAt: eligibilitySampleAt } }), 'intent UNKNOWN')
  } else {
    const currentActor = actor!
    count(await db.qualityJourneyE2ActorCustody.updateMany({ where: { id: currentActor.id,
      providerRunId: run.id, state: 'BOUND',
      originalChildIncarnationDigest: expected.originalChildIncarnationDigest,
      operationsReserved: currentActor.operationsReserved,
      bytesReserved: currentActor.bytesReserved, framesReserved: currentActor.framesReserved,
      setupReserved: currentActor.setupReserved,
      providerRequestsReserved: currentActor.providerRequestsReserved,
      mcpCallsReserved: currentActor.mcpCallsReserved,
      recoveryControlsReserved: 0 },
    data: { operationsReserved: { increment: 1 },
      ...(envelope.maxBytes ? { bytesReserved: { increment: envelope.maxBytes } } : {}),
      ...(envelope.maxFrames ? { framesReserved: { increment: envelope.maxFrames } } : {}),
      ...(charges.setupReserved ? { setupReserved: { increment: 1 } } : {}),
      ...(charges.providerRequestsReserved ? { providerRequestsReserved: { increment: 1 } } : {}),
      ...(charges.mcpCallsReserved ? { mcpCallsReserved: { increment: 1 } } : {}) },
    }), 'actor budget')
    if (charges.providerRequestsReserved) count(await db.qualityJourneyProviderRun.updateMany({
      where: { id: run.id, status: run.status, turnsReserved: run.turnsReserved },
      data: { turnsReserved: { increment: 1 } },
    }), 'provider turn budget')
  }
  const grant: Grant = { id: ids.grantId, providerRunId: run.id, actorCustodyId: actorId,
    intentId: intent.id, operationId: envelope.operationId, sequence: envelope.sequence,
    kind: envelope.kind, setupStage: envelope.setupStage, sourceTupleDigest: envelope.sourceTupleDigest,
    requestDigest: request.requestDigest, envelopeDigest, operationPreparationId: prep.id,
    admissionVersion, journeyId: journey.id, targetProjectId: journey.targetProjectId,
    coordinatorSessionId: session.id, generation: request.generation,
    attemptId: attempt.id, authorizationId: authorization.id, leaseId: request.leaseId,
    assignmentGeneration: request.assignmentGeneration, rangeId: envelope.rangeId,
    parentOperationId: envelope.parentOperationId, payloadDigest: envelope.payloadDigest,
    payloadByteLength: envelope.payloadByteLength,
    payloadReceiveTimeoutMs: envelope.payloadReceiveTimeoutMs,
    maxBytes: envelope.maxBytes, maxFrames: envelope.maxFrames,
    maxControlFrames: envelope.maxControlFrames, maxDescendants: envelope.maxDescendants }
  await db.qualityJourneyE2Grant.create({ data: { ...grant,
    earliestDueAt: evidence.earliestDueAt, dueAtSourceDigest: evidence.dueAtSourceDigest,
    eligibilitySampleAt,
    handoffId: ids.handoffId, state: 'COMMITTED_UNDELIVERED' } })
  return { status: 'DB_COMMITTED_INERT', outcome: 'GRANT',
    operationId: envelope.operationId, eligibilitySampleAt,
    earliestDueAt: evidence.earliestDueAt, dueAtSourceDigest: evidence.dueAtSourceDigest,
    admissionVersion, commitReceiptDigest: receiptDigest(grant) }
}
