import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  withJourneyBusinessWriteJoinInTransaction,
  type BeforeJourneyBusinessWrite,
} from './quality-journey-business-write-join'
import {
  trustedHumanCoordinatorSession,
  type CoordinatorSessionCredentials,
} from './quality-journey-coordinator-session'
import { assertE2BusinessAdmission } from './quality-journey-e2-retirement-service'

vi.mock('./quality-journey-e2-retirement-service', () => ({ assertE2BusinessAdmission: vi.fn() }))

const scope = { journeyId: 'journey-join-synthetic', targetProjectId: 'target-join-synthetic' }
const credentials = {
  ...scope,
  coordinatorSessionId: 'session-join-synthetic',
  coordinatorGeneration: 1,
  coordinatorPrincipalId: 'principal-join-synthetic',
}
const admitted = { kind: 'E2_V1' as const, admissionVersion: 1 }
const canonicalAdmission = vi.mocked(assertE2BusinessAdmission)

type JourneyRow = typeof scope & { currentCoordinatorSessionId: string | null }
type SessionRow = typeof scope & {
  id: string
  generation: number
  ownerPrincipalId: string
  status: string
  e2EnrollmentKind: string | null
  e2EnrollmentDigest: string | null
  e2EnrolledAt: Date | null
}

/** Detached query snapshots only; no Prisma constructor, database or transaction runner. */
function transactionFixture(options: {
  journey?: JourneyRow | null
  session?: SessionRow | null
  orphan?: { id: string } | null
} = {}) {
  const state = structuredClone({
    journey: options.journey === undefined
      ? { ...scope, currentCoordinatorSessionId: credentials.coordinatorSessionId }
      : options.journey,
    session: options.session === undefined
      ? { ...scope, id: credentials.coordinatorSessionId, generation: 1,
          ownerPrincipalId: credentials.coordinatorPrincipalId, status: 'ACTIVE',
          e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'a'.repeat(64), e2EnrolledAt: new Date(0) }
      : options.session,
    orphan: options.orphan ?? null,
  })
  const models = {
    qualityJourney: { findFirst: vi.fn(async () => structuredClone(state.journey)) },
    qualityJourneyCoordinatorSession: { findUnique: vi.fn(async () => structuredClone(state.session)) },
    qualityJourneyE2Retirement: { findFirst: vi.fn(async () => structuredClone(state.orphan)) },
  }
  return { state, models, tx: models as unknown as Prisma.TransactionClient }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

function observe<T>(promise: Promise<T>) {
  return promise.then(
    value => ({ status: 'fulfilled' as const, value }),
    error => ({ status: 'rejected' as const, error: error as unknown }),
  )
}

async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('SYNTHETIC_JOIN_WAIT_TIMEOUT')), 1_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function legacySession(): SessionRow {
  return { ...scope, id: credentials.coordinatorSessionId, generation: 1,
    ownerPrincipalId: credentials.coordinatorPrincipalId, status: 'ACTIVE',
    e2EnrollmentKind: null, e2EnrollmentDigest: null, e2EnrolledAt: null }
}

beforeEach(() => {
  canonicalAdmission.mockReset()
  canonicalAdmission.mockResolvedValue(admitted)
})

describe('Journey business write join ownership and lazy control flow', () => {
  it('returns an exact replay result without any lineage read or canonical admission', async () => {
    const fixture = transactionFixture()
    const replay = Object.freeze({ replayed: true, receiptId: 'receipt-join-synthetic' })
    const result = await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, undefined,
      async () => replay)
    expect(result).toBe(replay)
    expect(fixture.models.qualityJourney.findFirst).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneyCoordinatorSession.findUnique).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).not.toHaveBeenCalled()
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('admits nested awaited child writes once and preserves their ordinary result', async () => {
    const fixture = transactionFixture()
    const writes: string[] = []
    const child = async (beforeWrite: BeforeJourneyBusinessWrite) => {
      await beforeWrite(fixture.tx, scope)
      writes.push('child')
    }
    const result = await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => {
        await beforeWrite(fixture.tx, scope)
        writes.push('parent')
        await child(beforeWrite)
        await beforeWrite(fixture.tx, { ...scope })
        writes.push('sidecar')
        return { ordinary: 'result' }
      })
    expect(result).toEqual({ ordinary: 'result' })
    expect(writes).toEqual(['parent', 'child', 'sidecar'])
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    expect(canonicalAdmission.mock.calls[0]?.[0]).toBe(fixture.tx)
    expect(fixture.models.qualityJourney.findFirst).toHaveBeenCalledTimes(1)
    expect(fixture.models.qualityJourneyCoordinatorSession.findUnique).toHaveBeenCalledTimes(1)
  })

  it('makes concurrent awaited children share one pending admission before either writes', async () => {
    const fixture = transactionFixture()
    const entered = deferred<void>()
    const release = deferred<typeof admitted>()
    const writes: string[] = []
    canonicalAdmission.mockImplementationOnce(async () => {
      entered.resolve(undefined)
      return release.promise
    })
    const result = observe(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => {
        await Promise.all(['first', 'second'].map(async name => {
          await beforeWrite(fixture.tx, scope)
          writes.push(name)
        }))
        return 'both-written'
      }))
    try {
      await bounded(entered.promise)
      expect(canonicalAdmission).toHaveBeenCalledTimes(1)
      expect(fixture.models.qualityJourney.findFirst).toHaveBeenCalledTimes(1)
      expect(writes).toEqual([])
      release.resolve(admitted)
      expect(await bounded(result)).toEqual({ status: 'fulfilled', value: 'both-written' })
      expect(writes.sort()).toEqual(['first', 'second'])
      expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    } finally {
      release.resolve(admitted)
      await bounded(result)
    }
  })

  it('performs two admissions for two independent owning groups sharing the same transaction', async () => {
    const fixture = transactionFixture()
    for (const group of ['first', 'second']) {
      expect(await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
        async beforeWrite => { await beforeWrite(fixture.tx, scope); return group })).toBe(group)
    }
    expect(canonicalAdmission).toHaveBeenCalledTimes(2)
    expect(fixture.models.qualityJourney.findFirst).toHaveBeenCalledTimes(2)
    expect(canonicalAdmission.mock.calls.map(call => call[0])).toEqual([fixture.tx, fixture.tx])
  })

  it.each(['transaction', 'journey', 'target'] as const)(
    'poisons the owner when a child catches a foreign %s callback refusal', async mismatch => {
      const fixture = transactionFixture()
      const foreign = transactionFixture()
      let caught: unknown
      const result = withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
        async beforeWrite => {
          try {
            await beforeWrite(mismatch === 'transaction' ? foreign.tx : fixture.tx,
              mismatch === 'journey' ? { ...scope, journeyId: 'journey-foreign' } :
                mismatch === 'target' ? { ...scope, targetProjectId: 'target-foreign' } : scope)
          } catch (error) { caught = error }
          await expect(beforeWrite(fixture.tx, scope)).rejects.toBe(caught)
          return 'must-not-commit'
        })
      expect(await observe(result)).toEqual({ status: 'rejected', error: caught })
      expect(caught).toMatchObject({ code: 'CONFLICT' })
      expect(fixture.models.qualityJourney.findFirst).not.toHaveBeenCalled()
      expect(canonicalAdmission).not.toHaveBeenCalled()
    },
  )

  it('poisons an already admitted group when a later scope failure is caught', async () => {
    const fixture = transactionFixture()
    let caught: unknown
    const result = withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => {
        await beforeWrite(fixture.tx, scope)
        try { await beforeWrite(fixture.tx, { ...scope, journeyId: 'journey-foreign' }) }
        catch (error) { caught = error }
        return 'must-not-commit'
      })
    expect(await observe(result)).toEqual({ status: 'rejected', error: caught })
    expect(caught).toMatchObject({ code: 'CONFLICT' })
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
  })

  it('retains canonical refusal and prevents success even when every child catches it', async () => {
    const fixture = transactionFixture()
    const refusal = new Error('SYNTHETIC_CANONICAL_ADMISSION_REFUSAL')
    canonicalAdmission.mockRejectedValueOnce(refusal)
    const result = withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => {
        await expect(beforeWrite(fixture.tx, scope)).rejects.toBe(refusal)
        await expect(beforeWrite(fixture.tx, scope)).rejects.toBe(refusal)
        return 'must-not-commit'
      })
    await expect(result).rejects.toBe(refusal)
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    expect(fixture.models.qualityJourney.findFirst).toHaveBeenCalledTimes(1)
  })

  it('closes a retained callback after a successful owner returns', async () => {
    const fixture = transactionFixture()
    let retained!: BeforeJourneyBusinessWrite
    await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials, async beforeWrite => {
      retained = beforeWrite
      await beforeWrite(fixture.tx, scope)
    })
    await expect(retained(fixture.tx, scope)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    expect(fixture.models.qualityJourney.findFirst).toHaveBeenCalledTimes(1)
  })

  it('closes a callback retained from a lazy replay without reading any lineage afterward', async () => {
    const fixture = transactionFixture()
    let retained!: BeforeJourneyBusinessWrite
    await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials, async beforeWrite => {
      retained = beforeWrite
      return 'replay'
    })
    await expect(retained(fixture.tx, scope)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(fixture.models.qualityJourney.findFirst).not.toHaveBeenCalled()
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })
})

describe('Journey business write join original credentials and enrollment selection', () => {
  it('snapshots scope and credential scalars before the first owner await', async () => {
    const fixture = transactionFixture()
    const inputScope = { ...scope }
    const supplied = { ...credentials, coordinatorHandoffId: undefined as string | undefined,
      actor: 'USER', expectedEnrollmentDigest: 'ignored-pin' }
    const release = deferred<void>()
    const result = observe(withJourneyBusinessWriteJoinInTransaction(fixture.tx, inputScope, supplied,
      async beforeWrite => { await release.promise; await beforeWrite(fixture.tx, scope); return 'written' }))
    try {
      inputScope.journeyId = 'journey-mutated'
      inputScope.targetProjectId = 'target-mutated'
      Object.assign(supplied, { journeyId: 'journey-mutated', targetProjectId: 'target-mutated',
        coordinatorSessionId: 'session-mutated', coordinatorHandoffId: 'handoff-mutated',
        coordinatorGeneration: 2, coordinatorPrincipalId: 'principal-mutated' })
      expect(fixture.models.qualityJourney.findFirst).not.toHaveBeenCalled()
      release.resolve(undefined)
      expect(await bounded(result)).toEqual({ status: 'fulfilled', value: 'written' })
      const [actualTx, actualScope] = canonicalAdmission.mock.calls[0]!
      expect(actualTx).toBe(fixture.tx)
      expect(actualScope).toEqual({ ...scope, coordinatorSessionId: credentials.coordinatorSessionId,
        generation: credentials.coordinatorGeneration, credentials: { ...credentials, coordinatorHandoffId: undefined } })
      expect(Object.keys(actualScope.credentials).sort()).toEqual([
        'journeyId', 'targetProjectId', 'coordinatorSessionId', 'coordinatorHandoffId',
        'coordinatorGeneration', 'coordinatorPrincipalId',
      ].sort())
    } finally {
      release.resolve(undefined)
      await bounded(result)
    }
  })

  it('does not fill an absent original principal from the persisted current session', async () => {
    const fixture = transactionFixture()
    const supplied = { ...credentials, coordinatorPrincipalId: undefined }
    const refusal = new Error('SYNTHETIC_ORIGINAL_PRINCIPAL_REQUIRED')
    canonicalAdmission.mockImplementationOnce(async (_tx, request) => {
      expect(request.credentials.coordinatorPrincipalId).toBeUndefined()
      throw refusal
    })
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, supplied,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toBe(refusal)
    expect(fixture.state.session?.ownerPrincipalId).toBe(credentials.coordinatorPrincipalId)
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['absent', undefined],
    ['trusted-human symbol', trustedHumanCoordinatorSession],
    ['actor label', 'USER'],
    ['principal alone', { coordinatorPrincipalId: credentials.coordinatorPrincipalId }],
    ['missing Journey', { ...credentials, journeyId: undefined }],
    ['missing target', { ...credentials, targetProjectId: undefined }],
    ['missing session', { ...credentials, coordinatorSessionId: undefined }],
    ['missing generation', { ...credentials, coordinatorGeneration: undefined }],
    ['foreign session', { ...credentials, coordinatorSessionId: 'session-foreign' }],
    ['stale generation', { ...credentials, coordinatorGeneration: 2 }],
  ])('refuses E2 %s credentials without persisted reconstruction', async (_name, supplied) => {
    const fixture = transactionFixture()
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope,
      supplied as CoordinatorSessionCredentials | undefined,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('keeps all-null legacy behind its explicit orphan lookup without a canonical CAS', async () => {
    const fixture = transactionFixture({ session: legacySession() })
    await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, undefined,
      async beforeWrite => { await beforeWrite(fixture.tx, scope); await beforeWrite(fixture.tx, scope) })
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).toHaveBeenCalledTimes(1)
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).toHaveBeenCalledWith({
      where: { coordinatorSessionId: credentials.coordinatorSessionId }, select: { id: true },
    })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('keeps a no-session legacy group behind its Journey orphan check', async () => {
    const fixture = transactionFixture({ journey: { ...scope, currentCoordinatorSessionId: null }, session: null })
    await withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, undefined,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })
    expect(fixture.models.qualityJourneyCoordinatorSession.findUnique).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).toHaveBeenCalledTimes(1)
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).toHaveBeenCalledWith({
      where: { journeyId: scope.journeyId }, select: { id: true },
    })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('does not treat all-null enrollment with an orphan retirement as legacy', async () => {
    const fixture = transactionFixture({ session: legacySession(), orphan: { id: 'retirement-orphan' } })
    const refusal = new Error('SYNTHETIC_CANONICAL_ORPHAN_REFUSAL')
    canonicalAdmission.mockRejectedValueOnce(refusal)
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toBe(refusal)
    expect(fixture.models.qualityJourneyE2Retirement.findFirst).toHaveBeenCalledTimes(1)
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
  })

  it.each(['kind', 'digest', 'date'] as const)(
    'refuses missing original credentials for partial E2 enrollment with null %s', async missing => {
      const fixture = transactionFixture()
      if (!fixture.state.session) throw new Error('synthetic session missing')
      if (missing === 'kind') fixture.state.session.e2EnrollmentKind = null
      if (missing === 'digest') fixture.state.session.e2EnrollmentDigest = null
      if (missing === 'date') fixture.state.session.e2EnrolledAt = null
      await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, undefined,
        async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(canonicalAdmission).not.toHaveBeenCalled()
      expect(fixture.models.qualityJourneyE2Retirement.findFirst).not.toHaveBeenCalled()
    },
  )

  it('delegates partial enrollment validation with original credentials to the canonical primitive', async () => {
    const fixture = transactionFixture()
    if (!fixture.state.session) throw new Error('synthetic session missing')
    fixture.state.session.e2EnrollmentDigest = null
    const refusal = new Error('SYNTHETIC_CANONICAL_PARTIAL_ENROLLMENT_REFUSAL')
    canonicalAdmission.mockRejectedValueOnce(refusal)
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toBe(refusal)
    expect(canonicalAdmission).toHaveBeenCalledTimes(1)
  })

  it.each(['journey', 'target'] as const)('refuses a foreign current-session %s before admission', async foreign => {
    const fixture = transactionFixture()
    if (!fixture.state.session) throw new Error('synthetic session missing')
    if (foreign === 'journey') fixture.state.session.journeyId = 'journey-foreign'
    else fixture.state.session.targetProjectId = 'target-foreign'
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('refuses a missing current session even when its orphan lookup is empty', async () => {
    const fixture = transactionFixture({ session: null })
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('refuses a no-session Journey with retained orphan retirement instead of adopting it', async () => {
    const fixture = transactionFixture({ journey: { ...scope, currentCoordinatorSessionId: null },
      session: null, orphan: { id: 'retirement-orphan' } })
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('refuses a missing Journey instead of reading or adopting session lineage', async () => {
    const fixture = transactionFixture({ journey: null })
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { await beforeWrite(fixture.tx, scope) })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fixture.models.qualityJourneyCoordinatorSession.findUnique).not.toHaveBeenCalled()
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

})

describe('Journey business write join owner failure and pending guard lifetime', () => {
  it('never returns owner success with a rejected floated guard across admission-completion microtasks', async () => {
    const outcomes: Array<{ turns: number; owner: string; guard: string }> = []
    // Native resolved query doubles give a finite microtask-only schedule. Sweep
    // both sides of admission completion without depending on an exact internal
    // await count, wall-clock sleeps, production hooks or a database transaction.
    for (const turns of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24]) {
      const fixture = transactionFixture()
      let guardOutcome: ReturnType<typeof observe<void>> | undefined
      const owner = await bounded(observe(withJourneyBusinessWriteJoinInTransaction(
        fixture.tx, scope, credentials, async beforeWrite => {
          guardOutcome = observe(beforeWrite(fixture.tx, scope))
          for (let turn = 0; turn < turns; turn++) await Promise.resolve()
          return 'ordinary-result'
        },
      )))
      const guard = await bounded(guardOutcome!)
      outcomes.push({ turns, owner: owner.status, guard: guard.status })
      if (guard.status === 'rejected') {
        expect(owner.status).toBe('rejected')
        expect(guard.error).toMatchObject({ code: 'CONFLICT' })
      }
    }
    expect(outcomes[0]).toEqual({ turns: 0, owner: 'rejected', guard: 'rejected' })
    expect(outcomes.at(-1)).toEqual({ turns: 24, owner: 'fulfilled', guard: 'fulfilled' })
    expect(canonicalAdmission).toHaveBeenCalledTimes(outcomes.length)
  })

  it('propagates an owner error and closes a retained callback without lazy reads', async () => {
    const fixture = transactionFixture()
    const ownerError = new Error('SYNTHETIC_OWNER_FAILURE')
    let retained!: BeforeJourneyBusinessWrite
    await expect(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { retained = beforeWrite; throw ownerError })).rejects.toBe(ownerError)
    await expect(retained(fixture.tx, scope)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(fixture.models.qualityJourney.findFirst).not.toHaveBeenCalled()
    expect(canonicalAdmission).not.toHaveBeenCalled()
  })

  it('does not return success when its owner floats an unfinished guard', async () => {
    const fixture = transactionFixture()
    const entered = deferred<void>()
    const release = deferred<typeof admitted>()
    let guardOutcome: ReturnType<typeof observe<void>> | undefined
    let settled = false
    canonicalAdmission.mockImplementationOnce(async () => { entered.resolve(undefined); return release.promise })
    const ownerOutcome = observe(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => { guardOutcome = observe(beforeWrite(fixture.tx, scope)); return 'must-not-commit' }))
      .then(outcome => { settled = true; return outcome })
    try {
      await bounded(entered.promise)
      expect(settled).toBe(false)
      release.resolve(admitted)
      const outcome = await bounded(ownerOutcome)
      expect(outcome.status).toBe('rejected')
      if (outcome.status !== 'rejected') throw new Error('floated guard returned owner success')
      expect(outcome.error).toMatchObject({ code: 'CONFLICT' })
      expect((outcome.error as Error).message).toContain('returned before admission completed')
      expect(await bounded(guardOutcome!)).toMatchObject({ status: 'rejected', error: { code: 'CONFLICT' } })
      expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    } finally {
      release.resolve(admitted)
      await bounded(ownerOutcome)
      if (guardOutcome) await bounded(guardOutcome)
    }
  })

  it('awaits a pending guard on owner failure while preserving the original owner error', async () => {
    const fixture = transactionFixture()
    const entered = deferred<void>()
    const release = deferred<typeof admitted>()
    const ownerError = new Error('SYNTHETIC_OWNER_FAILED_DURING_ADMISSION')
    let guardOutcome: ReturnType<typeof observe<void>> | undefined
    let settled = false
    canonicalAdmission.mockImplementationOnce(async () => { entered.resolve(undefined); return release.promise })
    const ownerOutcome = observe(withJourneyBusinessWriteJoinInTransaction(fixture.tx, scope, credentials,
      async beforeWrite => {
        guardOutcome = observe(beforeWrite(fixture.tx, scope))
        throw ownerError
      })).then(outcome => { settled = true; return outcome })
    try {
      await bounded(entered.promise)
      expect(settled).toBe(false)
      release.resolve(admitted)
      expect(await bounded(ownerOutcome)).toEqual({ status: 'rejected', error: ownerError })
      expect(await bounded(guardOutcome!)).toMatchObject({ status: 'rejected', error: { code: 'CONFLICT' } })
      expect(canonicalAdmission).toHaveBeenCalledTimes(1)
    } finally {
      release.resolve(admitted)
      await bounded(ownerOutcome)
      if (guardOutcome) await bounded(guardOutcome)
    }
  })
})
