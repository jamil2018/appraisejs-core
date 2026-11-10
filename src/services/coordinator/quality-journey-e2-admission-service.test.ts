import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { E2_ENVELOPE_VERSION, e2EnvelopeDigest, type E2FiniteEnvelope } from
  '@/lib/quality-journey/provider-grant-contract'
import {
  E2_DUE_AT_SOURCE_DOMAIN, e2DueAtSourceDigest, evaluateSyntheticE2Admission,
  issueE2GrantInTx, readE2IdentityAndLineage,
  type SyntheticE2AdmissionRequest, type SyntheticE2AdmissionSnapshot,
} from './quality-journey-e2-admission-service'

const digest = 'a'.repeat(64)
const requestDigest = 'b'.repeat(64)
const at = (value: string) => new Date(`2026-10-24T${value}:00.000Z`)
const envelope: E2FiniteEnvelope = {
  version: E2_ENVELOPE_VERSION, runId: 'run', intentId: 'intent', operationId: 'op0',
  rangeId: 'op0', parentOperationId: null, sourceTupleDigest: digest, sequence: 0,
  kind: 'NATIVE_START', setupStage: null, payloadDigest: null, payloadByteLength: null,
  payloadReceiveTimeoutMs: null, maxBytes: 0, maxFrames: 0, maxControlFrames: 0,
  maxDescendants: 1,
}
const request: SyntheticE2AdmissionRequest = {
  journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
  generation: 1, providerRunId: 'run', attemptId: 'attempt', authorizationId: 'auth',
  leaseId: 'lease', assignmentGeneration: 1, intentId: 'intent',
  expectedEnrollmentDigest: digest, requestDigest, envelope,
}
const snapshot = (): SyntheticE2AdmissionSnapshot => ({
  journey: { id: 'journey', targetProjectId: 'target', currentCoordinatorSessionId: 'session',
    status: 'ACTIVE', e2AdmissionVersion: 3, e2NativeStartsReserved: 0,
    e2TurnStartsReserved: 0 },
  session: { id: 'session', journeyId: 'journey', targetProjectId: 'target', generation: 1,
    status: 'ACTIVE', fencedAt: null, e2EnrollmentKind: 'E2_V1',
    e2EnrollmentDigest: digest, e2EnrolledAt: at('00:00') },
  retirement: { journeyId: 'journey', targetProjectId: 'target',
    coordinatorSessionId: 'session', generation: 1, state: 'ACTIVE', requestId: null,
    requestedAt: null, requestReason: null, effectiveAt: null, effectiveEvidenceDigest: null },
  attempt: { id: 'attempt', workItemId: 'work', authorizationId: 'auth', leaseId: 'lease',
    assignmentGeneration: 1, attempt: 1, status: 'IN_PROGRESS', cancelledAt: null,
    leaseExpiresAt: at('01:00') },
  workItem: { id: 'work', status: 'IN_PROGRESS', currentAttempt: 1 },
  authorization: { id: 'auth', journeyId: 'journey', targetProjectId: 'target',
    workItemId: 'work', maxAttempts: 3, cancelledAt: null, revokedAt: null,
    successorAuthorizationId: null },
  run: { id: 'run', journeyId: 'journey', targetProjectId: 'target',
    coordinatorSessionId: 'session', generation: 1, attemptId: 'attempt',
    authorizationId: 'auth', leaseId: 'lease', assignmentGeneration: 1,
    status: 'PREPARED', unresolvedRetentionAt: at('03:00'), terminalRetentionAt: null,
    turnsReserved: 0 },
  intent: { id: 'intent', providerRunId: 'run', status: 'CLAIMED', invalidatedAt: null,
    acknowledgementDueAt: at('00:01'), turnDueAt: at('00:15'),
    acknowledgedAt: null, turnOrdinal: 1 },
  slot: { id: 'HUB', providerRunId: null, intentId: null },
  actor: null, parentGrant: null, duplicateGrant: null, usedSetupStages: [],
  sourceWindow: { ownerId: 'source', sourceTupleDigest: digest, dueAt: at('02:00') },
})

describe('E2 synthetic admission kernel and refusing production entry', () => {
  it('keeps both production entrypoints refused without touching a transaction', async () => {
    const tx = new Proxy({}, { get: () => { throw new Error('transaction must not be touched') } })
    expect(await readE2IdentityAndLineage(tx, request)).toEqual({ status: 'REFUSED_UNQUALIFIED_SOURCE' })
    expect(await issueE2GrantInTx(tx, request as never)).toEqual({
      status: 'REFUSED', reason: 'REFUSED_UNQUALIFIED_SOURCE',
    })
  })

  it('uses one final sample and records a stable exact deadline-source digest without a grant', () => {
    const clock = vi.fn(() => at('00:00'))
    const decision = evaluateSyntheticE2Admission(snapshot(), request, clock)
    expect(decision.status).toBe('SYNTHETIC_ELIGIBLE_NO_GRANT')
    if (decision.status !== 'SYNTHETIC_ELIGIBLE_NO_GRANT') throw new Error('expected inert eligibility')
    expect(clock).toHaveBeenCalledTimes(1)
    expect(decision.earliestDueAt).toEqual(at('00:01'))
    expect(decision.resultingAdmissionVersion).toBe(4)
    expect(decision.journeyNativeStartsDelta).toBe(1)
    expect(decision.journeyTurnStartsDelta).toBe(0)
    expect(decision.actorTotals.operationsReserved).toBe(1)
    expect(decision.envelopeDigest).toBe(e2EnvelopeDigest(envelope))
    expect(decision.dueAtSourceDigest).toBe(createHash('sha256')
      .update(`${E2_DUE_AT_SOURCE_DOMAIN}\n${JSON.stringify([...decision.dueAtSources]
        .sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0))}`, 'utf8')
      .digest('hex'))
    expect(e2DueAtSourceDigest(decision.dueAtSources)).toBe(decision.dueAtSourceDigest)
    expect('command' in decision).toBe(false)
  })

  it('identifies expiry at the sample without throwing or claiming a committed latch', () => {
    const clock = vi.fn(() => at('00:01'))
    const decision = evaluateSyntheticE2Admission(snapshot(), request, clock)
    expect(decision).toMatchObject({ status: 'SYNTHETIC_EXPIRED_REQUIRES_LATCH',
      reason: 'INTENT_DEADLINE_EXPIRED', earliestDueAt: at('00:01') })
    expect(clock).toHaveBeenCalledTimes(1)
  })

  it('resolves an exact duplicate to an inert receipt before taking a clock sample', () => {
    const current = { ...snapshot(), duplicateGrant: { providerRunId: 'run', operationId: 'op0',
      requestDigest, envelopeDigest: e2EnvelopeDigest(envelope), commitReceiptDigest: 'c'.repeat(64) } }
    const clock = vi.fn(() => at('00:00'))
    expect(evaluateSyntheticE2Admission(current, request, clock)).toMatchObject({
      status: 'SYNTHETIC_READ_ONLY_RECEIPT', receipt: { operationId: 'op0', requestDigest },
    })
    expect(evaluateSyntheticE2Admission(current, { ...request, requestDigest: 'd'.repeat(64) }, clock))
      .toEqual({ status: 'SYNTHETIC_REFUSED', reason: 'DUPLICATE_MISMATCH' })
    expect(clock).not.toHaveBeenCalled()
  })

  it('rejects foreign lineage, missing deadlines and exhausted reservations before sampling', () => {
    const clock = vi.fn(() => at('00:00'))
    const current = snapshot()
    for (const altered of [
      { ...current, session: { ...current.session, e2EnrollmentDigest: 'd'.repeat(64) } },
      { ...current, retirement: null },
      { ...current, intent: { ...current.intent, acknowledgementDueAt: null } },
      { ...current, journey: { ...current.journey, e2NativeStartsReserved: 6 } },
      { ...current, slot: { ...current.slot, providerRunId: 'other' } },
      { ...current, authorization: { ...current.authorization, revokedAt: at('00:00') } },
    ]) expect(evaluateSyntheticE2Admission(altered, request, clock).status).toBe('SYNTHETIC_REFUSED')
    expect(clock).not.toHaveBeenCalled()
  })

  it('precharges a bounded later setup against the returned original actor and start parent', () => {
    const current = snapshot()
    const setup: E2FiniteEnvelope = { ...envelope, operationId: 'op1', rangeId: 'op1',
      parentOperationId: 'op0', sequence: 1, kind: 'SETUP', setupStage: 'DNS', maxDescendants: 0 }
    const bound: SyntheticE2AdmissionSnapshot = {
      ...current, run: { ...current.run, status: 'UNKNOWN' },
      intent: { ...current.intent, status: 'UNKNOWN', acknowledgedAt: at('00:00') },
      slot: { id: 'HUB', providerRunId: 'run', intentId: 'intent' },
      actor: { id: 'actor', journeyId: 'journey', targetProjectId: 'target',
        coordinatorSessionId: 'session', generation: 1, providerRunId: 'run', intentId: 'intent',
        sourceTupleDigest: digest, state: 'BOUND', originalChildIncarnationDigest: 'e'.repeat(64),
        operationsReserved: 1, bytesReserved: 0, framesReserved: 0, setupReserved: 0,
        providerRequestsReserved: 0, mcpCallsReserved: 0, recoveryControlsReserved: 0 },
      parentGrant: { actorCustodyId: 'actor', providerRunId: 'run', operationId: 'op0',
        sequence: 0, kind: 'NATIVE_START', sourceTupleDigest: digest },
    }
    const decision = evaluateSyntheticE2Admission(bound, { ...request, envelope: setup }, () => at('00:00'))
    expect(decision).toMatchObject({ status: 'SYNTHETIC_ELIGIBLE_NO_GRANT',
      actorTotals: { operationsReserved: 2, setupReserved: 1 } })
  })
})
