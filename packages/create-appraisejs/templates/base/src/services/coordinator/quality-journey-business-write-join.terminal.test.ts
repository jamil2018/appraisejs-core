import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import {
  terminalRetirementRequestId,
  withJourneyBusinessWriteJoinInTransaction,
  type AttemptTerminalInput,
  type TerminalPublicationKind,
} from './quality-journey-business-write-join'
import { assertE2BusinessAdmission, commitE2RetirementRequest } from './quality-journey-e2-retirement-service'

vi.mock('./quality-journey-e2-retirement-service', () => ({
  assertE2BusinessAdmission: vi.fn(),
  commitE2RetirementRequest: vi.fn(),
}))

const scope = { journeyId: 'journey-terminal-toy', targetProjectId: 'target-terminal-toy' }
const credentials = { ...scope, coordinatorSessionId: 'session-terminal-toy',
  coordinatorGeneration: 1, coordinatorPrincipalId: 'principal-terminal-toy' }
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const json = (value: unknown) => canonicalContractJson(value)
const tuple: AttemptTerminalInput = { attemptId: 'attempt-terminal-toy', workItemId: 'work-terminal-toy',
  authorizationId: 'auth-terminal-toy', resultHash: hash({ toyResult: 'done' }), terminalStatus: 'COMPLETED' }
const result = { toyResult: 'done' }
const admission = vi.mocked(assertE2BusinessAdmission)
const retire = vi.mocked(commitE2RetirementRequest)

function fixture(legacy = false) {
  const assignment = { assignmentId: 'assignment-terminal-toy', ...scope, workItemId: tuple.workItemId,
    inputHash: hash({ toyInput: true }), lease: { leaseId: 'lease-terminal-toy' } }
  const request = { assignmentId: assignment.assignmentId, requestId: 'spawn-terminal-toy' }
  const receipt = { requestId: request.requestId, toyReceipt: true }
  const authorizationValue = { toyAuthorization: true }
  const state = {
    journey: { id: scope.journeyId, ...scope, currentCoordinatorSessionId: credentials.coordinatorSessionId,
      hostingMode: 'APP_SERVER_LOCAL_V1', hostingContractVersion: 1 },
    session: { id: credentials.coordinatorSessionId, ...scope, generation: 1, status: 'ACTIVE',
      hostKind: 'APP_SERVER_LOCAL_V1', ownerPrincipalId: credentials.coordinatorPrincipalId,
      fencedAt: null, e2EnrollmentKind: legacy ? null : 'E2_V1',
      e2EnrollmentDigest: legacy ? null : 'a'.repeat(64), e2EnrolledAt: legacy ? null : new Date(0) },
    workItem: { id: tuple.workItemId, ...scope, role: 'SCOUT', roleContractDigest: hash({ role: 'SCOUT' }),
      inputHash: assignment.inputHash, status: 'IN_PROGRESS', currentAttempt: 1 },
    authorization: { id: tuple.authorizationId, ...scope, workItemId: tuple.workItemId,
      role: 'SCOUT', roleContractDigest: hash({ role: 'SCOUT' }), revokedAt: null, cancelledAt: null,
      authorizationJson: json(authorizationValue), authorizationHash: hash(authorizationValue) },
    attempt: { id: tuple.attemptId, workItemId: tuple.workItemId, authorizationId: tuple.authorizationId,
      status: 'IN_PROGRESS', attempt: 1, leaseId: 'lease-terminal-toy',
      leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'), assignmentGeneration: 1,
      assignmentId: assignment.assignmentId, assignmentJson: json(assignment), assignmentHash: hash(assignment),
      executionMode: 'MANAGED', spawnRequestId: request.requestId, spawnRequestJson: json(request),
      spawnRequestHash: hash(request), spawnReceiptJson: json(receipt), spawnReceiptHash: hash(receipt),
      externalAdmissionId: null, externalAdmissionJson: null, externalAdmissionHash: null,
      externalPrincipalId: null, externalPrincipalAssurance: null,
      resultJson: null as string | null, resultHash: null as string | null, completedAt: null as Date | null,
      sessionBinding: { ...scope, sessionId: credentials.coordinatorSessionId, coordinatorGeneration: 1,
        workItemId: tuple.workItemId, authorizationId: tuple.authorizationId, leaseId: 'lease-terminal-toy',
        role: 'SCOUT', inputHash: assignment.inputHash, assignmentId: assignment.assignmentId,
        assignmentGeneration: 1, provenance: 'CLAIM_SESSION_V1' } },
  }
  const models = {
    qualityJourney: { findFirst: vi.fn(async () => structuredClone(state.journey)) },
    qualityJourneyCoordinatorSession: { findUnique: vi.fn(async () => structuredClone(state.session)) },
    qualityJourneyE2Retirement: { findFirst: vi.fn(async () => null) },
    qualityJourneyWorkAttempt: { findUnique: vi.fn(async () => structuredClone({ ...state.attempt,
      workItem: state.workItem })) },
    qualityJourneyWorkAuthorization: { findUnique: vi.fn(async () => structuredClone(state.authorization)) },
  }
  return { state, models, tx: models as unknown as Prisma.TransactionClient,
    complete() { state.attempt.status = 'COMPLETED'; state.workItem.status = 'COMPLETED'
      state.attempt.resultJson = json(result); state.attempt.resultHash = tuple.resultHash
      state.attempt.completedAt = new Date('2026-10-24T00:00:00.000Z') },
  }
}

const publication = (kind: TerminalPublicationKind, selected = tuple) => ({
  kind, terminalAttemptId: selected.attemptId, terminalResultHash: selected.resultHash,
})

beforeEach(() => {
  admission.mockReset()
  retire.mockReset()
  admission.mockResolvedValue({ kind: 'E2_V1', admissionVersion: 1 })
  retire.mockResolvedValue({ status: 'RETIRE_REQUESTED', admissionVersion: 2,
    receipt: { requestId: 'toy', requestedAt: new Date(0), requestReason: 'ATTEMPT_TERMINAL',
      retirementId: 'retirement-terminal-toy' } })
})

describe('terminal Journey business group', () => {
  it('publishes one exact attempt and sidecars before its distinct retirement latch', async () => {
    const f = fixture()
    const trace: string[] = []
    admission.mockImplementationOnce(async () => { trace.push('admit'); return { kind: 'E2_V1', admissionVersion: 1 } })
    retire.mockImplementationOnce(async () => { trace.push('retire'); return { status: 'RETIRE_REQUESTED',
      admissionVersion: 2, receipt: { requestId: 'toy', requestedAt: new Date(0),
        requestReason: 'ATTEMPT_TERMINAL', retirementId: 'retirement-terminal-toy' } } })
    const returned = await withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async (beforeWrite, queue) => {
        await beforeWrite(f.tx, scope)
        trace.push('output')
        await Promise.all([queue(f.tx, scope, tuple), queue(f.tx, scope, { ...tuple })])
        await beforeWrite(f.tx, scope, publication('ATTEMPT_TERMINAL_ROW'))
        f.complete()
        trace.push('terminal')
        await beforeWrite(f.tx, scope, publication('WORK_ITEM_TERMINAL_ROW'))
        await beforeWrite(f.tx, scope, publication('WORK_COMPLETION_PROJECTION'))
        await beforeWrite(f.tx, scope, publication('ROLE_OUTPUT_FINALIZATION'))
        await beforeWrite(f.tx, scope, publication('EXTERNAL_ACCEPTANCE'))
        trace.push('acceptance')
        return { receipt: 'inert' }
      })
    expect(returned).toEqual({ receipt: 'inert' })
    expect(trace).toEqual(['admit', 'output', 'terminal', 'acceptance', 'retire'])
    expect(admission).toHaveBeenCalledTimes(1)
    expect(retire).toHaveBeenCalledTimes(1)
    expect(retire.mock.calls[0]?.[0]).toBe(f.tx)
    expect(retire.mock.calls[0]?.[2]).toBe('ATTEMPT_TERMINAL')
    const request = retire.mock.calls[0]?.[1]
    const requestId = 'e2_attempt_terminal_7340dc35a41b151c0e3848b070ee3dce57bc141e4fa2c485fcba6766107dd964'
    expect(terminalRetirementRequestId(scope, credentials.coordinatorSessionId,
      credentials.coordinatorGeneration, tuple)).toBe(requestId)
    expect(request?.requestId).toBe(requestId)
    expect(request?.requestedAt).toBeInstanceOf(Date)
    expect(request?.authority).toMatchObject({ kind: 'CURRENT_SESSION', credentials })
  })

  it('never queues an exact replay and never samples a retirement request', async () => {
    const f = fixture()
    const returned = await withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async () => ({ replay: true }))
    expect(returned).toEqual({ replay: true })
    expect(admission).not.toHaveBeenCalled()
    expect(retire).not.toHaveBeenCalled()
    expect(f.models.qualityJourney.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a terminal marker without its matching persisted completion', async () => {
    const f = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async (_beforeWrite, queue) => { await queue(f.tx, scope, tuple) }))
      .rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
  })

  it('poisons the group if an ordinary write follows queueing, even when caught by the leaf', async () => {
    const f = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async (beforeWrite, queue) => {
        await queue(f.tx, scope, tuple)
        await expect(beforeWrite(f.tx, scope)).rejects.toThrow()
        f.complete()
      })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
  })

  it('rejects a second distinct tuple, foreign publication, and a failed retirement result', async () => {
    const second = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(second.tx, scope, credentials,
      async (_beforeWrite, queue) => {
        await queue(second.tx, scope, tuple)
        await expect(queue(second.tx, scope, { ...tuple, attemptId: 'other-attempt-toy' })).rejects.toThrow()
        second.complete()
      })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()

    const wrongPublication = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(wrongPublication.tx, scope, credentials,
      async (beforeWrite, queue) => {
        await queue(wrongPublication.tx, scope, tuple)
        await expect(beforeWrite(wrongPublication.tx, scope,
          publication('ROLE_OUTPUT_FINALIZATION', { ...tuple, resultHash: hash({ different: true }) })))
          .rejects.toThrow()
        wrongPublication.complete()
      })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()

    retire.mockResolvedValueOnce({ status: 'READ_ONLY_RECEIPT', receipt: {
      requestId: 'old', requestedAt: new Date(0), requestReason: 'ATTEMPT_TERMINAL',
      retirementId: 'retirement-terminal-toy' } })
    const stale = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(stale.tx, scope, credentials,
      async (_beforeWrite, queue) => { await queue(stale.tx, scope, tuple); stale.complete() }))
      .rejects.toThrow()
    expect(retire).toHaveBeenCalledTimes(1)
  })

  it('poisons concurrent conflicting queue calls before either can publish', async () => {
    const f = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async (_beforeWrite, queue) => {
        await Promise.allSettled([
          queue(f.tx, scope, tuple),
          queue(f.tx, scope, { ...tuple, resultHash: hash({ otherResult: true }) }),
        ])
        f.complete()
      })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
  })

  it('requires the original current session and exact attempt binding', async () => {
    const f = fixture()
    f.state.attempt.sessionBinding.sessionId = 'foreign-session-toy'
    await expect(withJourneyBusinessWriteJoinInTransaction(f.tx, scope, credentials,
      async (_beforeWrite, queue) => { await queue(f.tx, scope, tuple) })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
    const noOwner = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(noOwner.tx, scope, undefined,
      async (_beforeWrite, queue) => { await queue(noOwner.tx, scope, tuple) })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
  })

  it('rejects a floated queue before its owner can return success', async () => {
    const floated = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(floated.tx, scope, credentials,
      async (_beforeWrite, queue) => {
        // The rejection is observed without awaiting it inside the owner body.
        void queue(floated.tx, scope, tuple).catch(() => undefined)
        return 'must-not-commit'
      })).rejects.toThrow()
    expect(retire).not.toHaveBeenCalled()
  })

  it('rejects a callback borrowed by a foreign transaction without admission', async () => {
    const owner = fixture()
    const foreign = fixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(owner.tx, scope, credentials,
      async (beforeWrite) => {
        await expect(beforeWrite(foreign.tx, scope)).rejects.toThrow()
        return 'must-not-commit'
      })).rejects.toThrow()
    expect(admission).not.toHaveBeenCalled()
    expect(retire).not.toHaveBeenCalled()
  })

  it('keeps all-null legacy terminal completion free of an E2 latch', async () => {
    const f = fixture(true)
    const returned = await withJourneyBusinessWriteJoinInTransaction(f.tx, scope, undefined,
      async (_beforeWrite, queue) => { await queue(f.tx, scope, tuple); f.complete(); return 'legacy' })
    expect(returned).toBe('legacy')
    expect(admission).not.toHaveBeenCalled()
    expect(retire).not.toHaveBeenCalled()
  })
})
