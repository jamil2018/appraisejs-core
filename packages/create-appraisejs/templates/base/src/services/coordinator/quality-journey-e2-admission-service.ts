import {
  canonicalE2Json, e2EnvelopeDigest, e2Sha256, isE2Digest, isE2Id, isE2Uint,
  parseE2FiniteEnvelope, prechargeE2Actor, type E2ActorTotals, type E2FiniteEnvelope,
  type E2SetupStage,
} from '@/lib/quality-journey/provider-grant-contract'
import type { E2GrantRequest, E2InertGrantCandidate, E2InertReceipt } from
  '@/lib/quality-journey/codex-app-server/native-e2-custody-core'

/**
 * Production E2 source/constructor enrollment is absent. These entrypoints are deliberately refusing.
 * The exported synthetic evaluator below returns inert data only: it has no Prisma writes, capability,
 * actor handle, or product registry path. Its input cannot qualify a source or authorize dispatch.
 */
export async function readE2IdentityAndLineage(_tx: unknown, _request: unknown): Promise<{
  status: 'REFUSED_UNQUALIFIED_SOURCE'
}> {
  return { status: 'REFUSED_UNQUALIFIED_SOURCE' }
}

export async function issueE2GrantInTx<Tx>(_tx: Tx, _request: E2GrantRequest<Tx>):
  Promise<E2InertGrantCandidate> {
  return { status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_SOURCE' }
}

export const E2_DUE_AT_SOURCE_DOMAIN = 'M06_E2_DUE_AT_SOURCES_V1' as const
type DeadlineField = 'attempt.leaseExpiresAt' | 'run.unresolvedRetentionAt' |
  'intent.acknowledgementDueAt' | 'intent.turnDueAt' | 'source.windowDueAt'
export type E2DueAtSource = Readonly<{ field: DeadlineField; ownerId: string; persistedAt: string }>
type Scope = Readonly<{ journeyId: string; targetProjectId: string; coordinatorSessionId: string;
  generation: number }>
type SyntheticJourney = Readonly<{ id: string; targetProjectId: string;
  currentCoordinatorSessionId: string | null; status: string; e2AdmissionVersion: number;
  e2NativeStartsReserved: number; e2TurnStartsReserved: number }>
type SyntheticSession = Readonly<{ id: string; journeyId: string; targetProjectId: string;
  generation: number | null; status: string; fencedAt: Date | null; e2EnrollmentKind: string | null;
  e2EnrollmentDigest: string | null; e2EnrolledAt: Date | null }>
type SyntheticRetirement = Scope & Readonly<{ state: string; requestId: string | null;
  requestedAt: Date | null; requestReason: string | null; effectiveAt: Date | null;
  effectiveEvidenceDigest: string | null }>
type SyntheticAttempt = Readonly<{ id: string; workItemId: string; authorizationId: string | null;
  leaseId: string; assignmentGeneration: number; attempt: number; status: string;
  cancelledAt: Date | null; leaseExpiresAt: Date }>
type SyntheticWorkItem = Readonly<{ id: string; status: string; currentAttempt: number }>
type SyntheticAuthorization = Readonly<{ id: string; journeyId: string; targetProjectId: string;
  workItemId: string; maxAttempts: number; cancelledAt: Date | null; revokedAt: Date | null;
  successorAuthorizationId: string | null }>
type SyntheticRun = Scope & Readonly<{ id: string; attemptId: string; authorizationId: string;
  leaseId: string; assignmentGeneration: number; status: string; unresolvedRetentionAt: Date;
  terminalRetentionAt: Date | null; turnsReserved: number }>
type SyntheticIntent = Readonly<{ id: string; providerRunId: string; status: string;
  invalidatedAt: Date | null; acknowledgementDueAt: Date | null; turnDueAt: Date | null;
  acknowledgedAt: Date | null; turnOrdinal: number }>
type SyntheticSlot = Readonly<{ id: string; providerRunId: string | null; intentId: string | null }>
type SyntheticActor = Scope & Readonly<{ id: string; providerRunId: string; intentId: string;
  sourceTupleDigest: string; state: string; originalChildIncarnationDigest: string | null;
  operationsReserved: number; bytesReserved: number; framesReserved: number; setupReserved: number;
  providerRequestsReserved: number; mcpCallsReserved: number; recoveryControlsReserved: number }>
type SyntheticParentGrant = Readonly<{ actorCustodyId: string; providerRunId: string;
  operationId: string; sequence: number; kind: E2FiniteEnvelope['kind'];
  sourceTupleDigest: string }>
type SyntheticDuplicateGrant = Readonly<{ providerRunId: string; operationId: string;
  requestDigest: string; envelopeDigest: string; commitReceiptDigest: string }>

/** Explicit inert values copied from a newly generated fixture, never a DB row or source-qualified claim. */
export type SyntheticE2AdmissionSnapshot = Readonly<{
  journey: SyntheticJourney
  session: SyntheticSession
  retirement: SyntheticRetirement | null
  attempt: SyntheticAttempt
  workItem: SyntheticWorkItem
  authorization: SyntheticAuthorization
  run: SyntheticRun
  intent: SyntheticIntent
  slot: SyntheticSlot
  actor: SyntheticActor | null
  parentGrant: SyntheticParentGrant | null
  duplicateGrant: SyntheticDuplicateGrant | null
  usedSetupStages: readonly E2SetupStage[]
  /** Fixture assertion only; a real issuer must prove this window was durably prepared before the sample. */
  sourceWindow: Readonly<{ ownerId: string; sourceTupleDigest: string; dueAt: Date }>
}>
export type SyntheticE2AdmissionRequest = Scope & Readonly<{
  providerRunId: string
  attemptId: string
  authorizationId: string
  leaseId: string
  assignmentGeneration: number
  intentId: string
  expectedEnrollmentDigest: string
  requestDigest: string
  envelope: E2FiniteEnvelope
}>
export type SyntheticE2AdmissionDecision =
  | Readonly<{ status: 'SYNTHETIC_REFUSED'; reason: string }>
  | Readonly<{ status: 'SYNTHETIC_READ_ONLY_RECEIPT'; receipt: E2InertReceipt }>
  | Readonly<{ status: 'SYNTHETIC_EXPIRED_REQUIRES_LATCH'; reason: string;
    eligibilitySampleAt: Date; earliestDueAt: Date; dueAtSourceDigest: string }>
  | Readonly<{ status: 'SYNTHETIC_ELIGIBLE_NO_GRANT'; eligibilitySampleAt: Date;
    earliestDueAt: Date; dueAtSourceDigest: string; dueAtSources: readonly E2DueAtSource[];
    envelopeDigest: string; resultingAdmissionVersion: number; actorTotals: E2ActorTotals;
    journeyNativeStartsDelta: 0 | 1; journeyTurnStartsDelta: 0 | 1 }>

const refused = (reason: string): SyntheticE2AdmissionDecision => ({ status: 'SYNTHETIC_REFUSED', reason })
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const sameScope = (row: Scope, request: Scope) => row.journeyId === request.journeyId &&
  row.targetProjectId === request.targetProjectId &&
  row.coordinatorSessionId === request.coordinatorSessionId && row.generation === request.generation
const due = (field: DeadlineField, ownerId: string, date: Date): E2DueAtSource =>
  ({ field, ownerId, persistedAt: date.toISOString() })

/** SHA-256 of domain + newline + canonical JSON of sorted exact due-at source tuples. */
export function e2DueAtSourceDigest(sources: readonly E2DueAtSource[]): string {
  if (!sources.length || sources.length > 5 || sources.some(source =>
    !isE2Id(source.ownerId) || !/^(attempt\.leaseExpiresAt|run\.unresolvedRetentionAt|intent\.acknowledgementDueAt|intent\.turnDueAt|source\.windowDueAt)$/.test(source.field) ||
    !Number.isFinite(Date.parse(source.persistedAt)) ||
    new Date(source.persistedAt).toISOString() !== source.persistedAt))
    throw new Error('E2 due-at source set refused')
  const ordered = [...sources].sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0)
  if (new Set(ordered.map(source => source.field)).size !== ordered.length)
    throw new Error('E2 duplicate due-at source')
  return e2Sha256(canonicalE2Json(ordered), `${E2_DUE_AT_SOURCE_DOMAIN}\n`)
}

/**
 * Pure offline evaluator of the settled checks. It never returns an affirmative grant candidate and does not
 * touch Prisma, clocks outside the injected one-shot sample, a child, a provider, or a native channel.
 */
export function evaluateSyntheticE2Admission(snapshot: SyntheticE2AdmissionSnapshot,
  request: SyntheticE2AdmissionRequest, sampleFinalClock: () => Date): SyntheticE2AdmissionDecision {
  let envelope: E2FiniteEnvelope
  let envelopeDigest: string
  try {
    envelope = parseE2FiniteEnvelope(request.envelope)
    envelopeDigest = e2EnvelopeDigest(envelope)
  } catch { return refused('ENVELOPE_INVALID') }
  if (![request.journeyId, request.targetProjectId, request.coordinatorSessionId,
    request.providerRunId, request.attemptId, request.authorizationId, request.leaseId,
    request.intentId].every(isE2Id) || !isE2Uint(request.generation) || request.generation < 1 ||
    !isE2Uint(request.assignmentGeneration) || request.assignmentGeneration < 1 ||
    !isE2Digest(request.requestDigest) || !isE2Digest(request.expectedEnrollmentDigest))
    return refused('REQUEST_IDENTITY_INVALID')
  const { journey, session, retirement, attempt, workItem, authorization, run, intent, slot,
    actor, parentGrant, duplicateGrant, sourceWindow } = snapshot
  if (journey.id !== request.journeyId || journey.targetProjectId !== request.targetProjectId ||
    journey.currentCoordinatorSessionId !== request.coordinatorSessionId ||
    session.id !== request.coordinatorSessionId || session.journeyId !== request.journeyId ||
    session.targetProjectId !== request.targetProjectId || session.generation !== request.generation ||
    session.status !== 'ACTIVE' || session.fencedAt !== null ||
    session.e2EnrollmentKind !== 'E2_V1' || !validDate(session.e2EnrolledAt) ||
    session.e2EnrollmentDigest !== request.expectedEnrollmentDigest ||
    !retirement || !sameScope(retirement, request) ||
    envelope.runId !== request.providerRunId || envelope.intentId !== request.intentId ||
    envelope.sourceTupleDigest !== request.expectedEnrollmentDigest ||
    sourceWindow.sourceTupleDigest !== request.expectedEnrollmentDigest ||
    !isE2Id(sourceWindow.ownerId)) return refused('LINEAGE_OR_SOURCE_INVALID')
  if (attempt.id !== request.attemptId || workItem.id !== attempt.workItemId ||
    workItem.status !== 'IN_PROGRESS' || workItem.currentAttempt !== attempt.attempt ||
    attempt.authorizationId !== request.authorizationId ||
    attempt.leaseId !== request.leaseId || attempt.assignmentGeneration !== request.assignmentGeneration ||
    authorization.id !== request.authorizationId || authorization.journeyId !== request.journeyId ||
    authorization.targetProjectId !== request.targetProjectId ||
    authorization.workItemId !== attempt.workItemId || !isE2Uint(attempt.attempt, 3) || attempt.attempt < 1 ||
    !isE2Uint(authorization.maxAttempts, 3) || authorization.maxAttempts < attempt.attempt ||
    !sameScope(run, request) || run.id !== request.providerRunId || run.attemptId !== request.attemptId ||
    run.authorizationId !== request.authorizationId || run.leaseId !== request.leaseId ||
    run.assignmentGeneration !== request.assignmentGeneration || intent.id !== request.intentId ||
    intent.providerRunId !== run.id || slot.id !== 'HUB') return refused('WORK_LINEAGE_INVALID')
  if (duplicateGrant) {
    if (duplicateGrant.providerRunId !== run.id || duplicateGrant.operationId !== envelope.operationId ||
      duplicateGrant.requestDigest !== request.requestDigest ||
      duplicateGrant.envelopeDigest !== envelopeDigest || !isE2Digest(duplicateGrant.commitReceiptDigest))
      return refused('DUPLICATE_MISMATCH')
    return { status: 'SYNTHETIC_READ_ONLY_RECEIPT', receipt: {
      operationId: envelope.operationId, requestDigest: request.requestDigest,
      envelopeDigest, commitReceiptDigest: duplicateGrant.commitReceiptDigest,
    } }
  }
  if (retirement.state !== 'ACTIVE' || retirement.requestId !== null || retirement.requestedAt !== null ||
    retirement.requestReason !== null || retirement.effectiveAt !== null ||
    retirement.effectiveEvidenceDigest !== null) return refused('RETIREMENT_NOT_ACTIVE')
  if (journey.status !== 'ACTIVE' || attempt.status !== 'IN_PROGRESS' || attempt.cancelledAt !== null ||
    authorization.cancelledAt !== null || authorization.revokedAt !== null ||
    authorization.successorAuthorizationId !== null || intent.invalidatedAt !== null ||
    !['PREPARED', 'UNKNOWN'].includes(run.status)) return refused('INVALIDATOR_REQUIRES_LATCH')
  if (!validDate(attempt.leaseExpiresAt) || !validDate(run.unresolvedRetentionAt) ||
    !validDate(sourceWindow.dueAt) || !validDate(intent.turnDueAt) ||
    (intent.acknowledgedAt === null && !validDate(intent.acknowledgementDueAt)))
    return refused('DEADLINE_INPUT_INCOMPLETE')
  const start = envelope.kind === 'NATIVE_START'
  if (start) {
    if (run.status !== 'PREPARED' || intent.status !== 'CLAIMED' ||
      slot.providerRunId !== null || slot.intentId !== null || actor !== null || parentGrant !== null ||
      !isE2Uint(journey.e2NativeStartsReserved, 5)) return refused('NATIVE_START_CUSTODY_INVALID')
  } else if (run.status !== 'UNKNOWN' || intent.status !== 'UNKNOWN' ||
    slot.providerRunId !== run.id || slot.intentId !== intent.id || !actor ||
    !sameScope(actor, request) || actor.providerRunId !== run.id || actor.intentId !== intent.id ||
    actor.sourceTupleDigest !== envelope.sourceTupleDigest || actor.state !== 'BOUND' ||
    !isE2Digest(actor.originalChildIncarnationDigest) ||
    !parentGrant || parentGrant.actorCustodyId !== actor.id || parentGrant.providerRunId !== run.id ||
    parentGrant.operationId !== envelope.parentOperationId ||
    parentGrant.sequence >= envelope.sequence ||
    parentGrant.sourceTupleDigest !== envelope.sourceTupleDigest ||
    envelope.sequence !== actor.operationsReserved ||
    (envelope.kind === 'SETUP' &&
      (parentGrant.kind !== 'NATIVE_START' || parentGrant.sequence !== 0)) ||
    (envelope.kind === 'PROVIDER_REQUEST' && parentGrant.kind !== 'SETUP') ||
    (envelope.kind === 'MCP_CALL' && parentGrant.kind !== 'PROVIDER_REQUEST'))
    return refused('ACTOR_OR_PARENT_INVALID')
  if (!isE2Uint(journey.e2AdmissionVersion, 2_147_483_645) ||
    !isE2Uint(journey.e2NativeStartsReserved, 6) ||
    !isE2Uint(journey.e2TurnStartsReserved, 5) || !isE2Uint(run.turnsReserved, 5) ||
    (envelope.kind === 'PROVIDER_REQUEST' &&
      (journey.e2TurnStartsReserved >= 5 || run.turnsReserved >= 5))) return refused('JOURNEY_BUDGET_EXHAUSTED')
  let actorTotals: E2ActorTotals
  try {
    actorTotals = prechargeE2Actor(actor ? {
      operationsReserved: actor.operationsReserved, bytesReserved: actor.bytesReserved,
      framesReserved: actor.framesReserved, nativeStartsReserved: 1,
      setupReserved: actor.setupReserved, providerRequestsReserved: actor.providerRequestsReserved,
      mcpCallsReserved: actor.mcpCallsReserved, recoveryControlsReserved: actor.recoveryControlsReserved,
    } : {
      operationsReserved: 0, bytesReserved: 0, framesReserved: 0, nativeStartsReserved: 0,
      setupReserved: 0, providerRequestsReserved: 0, mcpCallsReserved: 0, recoveryControlsReserved: 0,
    }, envelope, snapshot.usedSetupStages)
  } catch { return refused('ACTOR_BUDGET_EXHAUSTED') }
  const sources: E2DueAtSource[] = [
    due('attempt.leaseExpiresAt', attempt.id, attempt.leaseExpiresAt),
    due('run.unresolvedRetentionAt', run.id, run.unresolvedRetentionAt),
    due('intent.turnDueAt', intent.id, intent.turnDueAt),
    due('source.windowDueAt', sourceWindow.ownerId, sourceWindow.dueAt),
  ]
  if (intent.acknowledgedAt === null)
    sources.push(due('intent.acknowledgementDueAt', intent.id, intent.acknowledgementDueAt!))
  const earliest = new Date(Math.min(...sources.map(source => Date.parse(source.persistedAt))))
  const digest = e2DueAtSourceDigest(sources)
  let sample: Date
  try { sample = sampleFinalClock() } catch { return refused('FINAL_CLOCK_FAILED') }
  if (!validDate(sample)) return refused('FINAL_CLOCK_INVALID')
  const eligibilitySampleAt = new Date(sample.getTime())
  if (sample.getTime() >= earliest.getTime()) {
    const earliestField = sources.find(source => Date.parse(source.persistedAt) === earliest.getTime())!.field
    const reason = earliestField === 'attempt.leaseExpiresAt' ? 'LEASE_EXPIRED' :
      earliestField === 'run.unresolvedRetentionAt' ? 'RUN_RETENTION_EXPIRED' :
        earliestField === 'source.windowDueAt' ? 'SOURCE_FAILURE' : 'INTENT_DEADLINE_EXPIRED'
    return { status: 'SYNTHETIC_EXPIRED_REQUIRES_LATCH', reason,
      eligibilitySampleAt, earliestDueAt: earliest, dueAtSourceDigest: digest }
  }
  return { status: 'SYNTHETIC_ELIGIBLE_NO_GRANT', eligibilitySampleAt,
    earliestDueAt: earliest, dueAtSourceDigest: digest, dueAtSources: sources,
    envelopeDigest, resultingAdmissionVersion: journey.e2AdmissionVersion + 1, actorTotals,
    journeyNativeStartsDelta: start ? 1 : 0,
    journeyTurnStartsDelta: envelope.kind === 'PROVIDER_REQUEST' ? 1 : 0 }
}
