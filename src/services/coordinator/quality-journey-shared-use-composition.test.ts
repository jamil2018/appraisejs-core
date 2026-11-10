import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./quality-journey-coordinator-session', () => ({ assertCoordinatorAttemptSession: vi.fn(), assertCurrentCoordinatorSession: vi.fn() }))
vi.mock('./quality-journey-e2-retirement-service', () => ({ assertE2BusinessAdmission: vi.fn(), commitE2RetirementRequest: vi.fn() }))
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))
vi.mock('../../../packages/cucumber-runtime/src/step-definitions', async () => {
  const contracts = await import('../../../packages/cucumber-runtime/src/step-definitions/contracts')
  return { computeStepReferenceHash: contracts.computeStepReferenceHash,
    stepDefinitionSchema: contracts.stepDefinitionSchema, stepInvocationSchema: contracts.stepInvocationSchema }
})

import { assertE2BusinessAdmission } from './quality-journey-e2-retirement-service'
import type { E2BusinessScope } from './quality-journey-e2-retirement-service'
import { withJourneyBusinessWriteJoinInTransaction, withJourneySharedResourcePublicationInTransaction,
  type BeforeJourneyBusinessWrite } from './quality-journey-business-write-join'
import { acquireSharedResourceUseInBusinessGroupInTransaction,
  createLocatorEnsureReceiptAndAcquireUseInBusinessGroupInTransaction } from './quality-journey-shared-resource-use-service'

const scope: E2BusinessScope = { journeyId: 'journey-joined-use', targetProjectId: 'target-joined-use',
  coordinatorSessionId: 'session-joined-use', generation: 3,
  credentials: { journeyId: 'journey-joined-use', targetProjectId: 'target-joined-use',
    coordinatorSessionId: 'session-joined-use', coordinatorGeneration: 3,
    coordinatorPrincipalId: 'principal-joined-use', coordinatorHandoffId: 'handoff-joined-use' } }
function fixture() {
  const tx = {
    qualityJourney: { findFirst: vi.fn(async () => ({ id: scope.journeyId, targetProjectId: scope.targetProjectId,
      currentCoordinatorSessionId: scope.coordinatorSessionId })) },
    qualityJourneyCoordinatorSession: { findUnique: vi.fn(async () => ({ id: scope.coordinatorSessionId,
      journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, generation: 3,
      e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'a'.repeat(64), e2EnrolledAt: new Date(0) })) },
  } as unknown as Prisma.TransactionClient
  return { tx, owner: <T>(body: Parameters<typeof withJourneyBusinessWriteJoinInTransaction<T>>[3]) =>
    withJourneyBusinessWriteJoinInTransaction(tx, scope, scope.credentials, body) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(assertE2BusinessAdmission).mockResolvedValue({ kind: 'E2_V1', admissionVersion: 1 } as never)
})

describe('exact live business owner shared-resource composition', () => {
  it('reuses one ordinary admission across two publications and repeated real prewrite calls', async () => {
    const f = fixture()
    await f.owner(async beforeWrite => {
      await beforeWrite(f.tx, scope)
      const result = await withJourneySharedResourcePublicationInTransaction(f.tx, scope, beforeWrite, async admit => {
        expect(await admit()).toBeUndefined(); await admit(); return 'first-publication'
      })
      expect(result).toBe('first-publication')
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, beforeWrite, async admit => { await admit() })
      await beforeWrite(f.tx, scope)
    })
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
    expect(assertE2BusinessAdmission).toHaveBeenCalledWith(f.tx, scope)
  })

  it('does not share an admission between independent owners using the same transaction', async () => {
    const f = fixture()
    for (let index = 0; index < 2; index++) await f.owner(before =>
      withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async admit => { await admit() }))
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(2)
  })

  it('rejects fabricated wrapped bound and copied callback shapes before their operations run', async () => {
    const f = fixture(); const operation = vi.fn(async () => undefined)
    await f.owner(async before => {
      const shapes = [async () => undefined, (...args: Parameters<BeforeJourneyBusinessWrite>) => before(...args),
        before.bind(undefined), Object.assign(async () => undefined, { admitted: true, admissionVersion: 1 })]
      for (const shape of shapes) await expect(withJourneySharedResourcePublicationInTransaction(f.tx, scope, shape, operation)).rejects.toThrow('unrecognized')
    })
    expect(operation).not.toHaveBeenCalled(); expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('poisons the recognized owner on foreign transaction scope session generation principal or handoff', async () => {
    const variants: Array<{ scope: E2BusinessScope; foreignTx?: boolean }> = [
      { scope, foreignTx: true }, { scope: { ...scope, journeyId: 'foreign-journey' } },
      { scope: { ...scope, targetProjectId: 'foreign-target' } },
      { scope: { ...scope, coordinatorSessionId: 'foreign-session' } }, { scope: { ...scope, generation: 4 } },
      { scope: { ...scope, credentials: { ...scope.credentials, coordinatorPrincipalId: 'foreign-principal' } } },
      { scope: { ...scope, credentials: { ...scope.credentials, coordinatorHandoffId: 'foreign-handoff' } } },
    ]
    for (const variant of variants) {
      const f = fixture(); const operation = vi.fn(async () => undefined)
      await expect(f.owner(async before => {
        await withJourneySharedResourcePublicationInTransaction(variant.foreignTx ? {} as never : f.tx,
          variant.scope, before, operation).catch(() => undefined)
        return 'caught-error-is-not-commit'
      })).rejects.toThrow()
      expect(operation).not.toHaveBeenCalled()
    }
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('captures ordinary scope and credential scalars before an asynchronous child can mutate them', async () => {
    const f = fixture(); const supplied = { ...structuredClone(scope), credentials: { ...scope.credentials } }; const gate = deferred<void>(); const started = deferred<void>()
    const owner = f.owner(before => withJourneySharedResourcePublicationInTransaction(f.tx, supplied, before, async admit => {
      started.resolve(); await gate.promise; await admit()
    }))
    await started.promise; supplied.generation = 99; supplied.credentials.coordinatorGeneration = 99
    supplied.credentials.coordinatorPrincipalId = 'mutated-principal'; gate.resolve(); await owner
    expect(assertE2BusinessAdmission).toHaveBeenCalledWith(f.tx, scope)
  })

  it('poisons a genuine owner when joined Use input capture throws before any source read', async () => {
    const f = fixture(); const input = Object.defineProperty({ expectedDependencyDigest: 'a'.repeat(64) }, 'scope', { get() { throw new Error('CAPTURE_FAILURE') } })
    await expect(f.owner(async before => {
      await acquireSharedResourceUseInBusinessGroupInTransaction(f.tx, input as never, before).catch(() => undefined)
      return 'swallowed'
    })).rejects.toThrow('CAPTURE_FAILURE')
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('poisons a genuine owner on ENSURE input capture failure without minting receipt freshness', async () => {
    const f = fixture(); const input = Object.defineProperty({}, 'createdAt', { get() { throw new Error('ENSURE_CAPTURE_FAILURE') } })
    await expect(f.owner(async before => {
      await createLocatorEnsureReceiptAndAcquireUseInBusinessGroupInTransaction(f.tx, input as never, before).catch(() => undefined)
    })).rejects.toThrow('ENSURE_CAPTURE_FAILURE')
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('propagates a synchronous child failure even when the intermediate caller catches it', async () => {
    const f = fixture()
    await expect(f.owner(async before => {
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, () => { throw new Error('SYNC_CHILD_FAILURE') }).catch(() => undefined)
    })).rejects.toThrow('SYNC_CHILD_FAILURE')
  })

  it('propagates a rejected complete child after admission rather than tracking only preflight', async () => {
    const f = fixture()
    await expect(f.owner(async before => {
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async admit => {
        await admit(); await Promise.resolve(); throw new Error('CLAIM_INSERT_FAILURE')
      }).catch(() => undefined)
    })).rejects.toThrow('CLAIM_INSERT_FAILURE')
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
  })

  it('closes a child admission thunk at settlement and poisons delayed reuse while the parent is open', async () => {
    const f = fixture(); let escaped!: () => Promise<void>
    await expect(f.owner(async before => {
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async admit => { escaped = admit })
      await escaped().catch(() => undefined)
    })).rejects.toThrow('child is closed')
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('drains a floated admission thunk before rejecting a prematurely settled child', async () => {
    const f = fixture(); const gate = deferred<void>(); const entered = deferred<void>(); let settled = false
    vi.mocked(assertE2BusinessAdmission).mockImplementation(async () => { entered.resolve(); await gate.promise
      return { kind: 'E2_V1', admissionVersion: 1 } as never })
    const owner = f.owner(before => withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async admit => {
      void admit().catch(() => undefined); await entered.promise
    }))
    void owner.then(() => { settled = true }, () => { settled = true })
    await entered.promise; await Promise.resolve(); await Promise.resolve(); expect(settled).toBe(false)
    gate.resolve(); await expect(owner).rejects.toThrow(); expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
  })

  it('drains the entire floated shared-resource operation before the owner can return', async () => {
    const f = fixture(); const gate = deferred<void>(); const entered = deferred<void>(); let settled = false
    const owner = f.owner(async before => {
      void withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async () => {
        entered.resolve(); await gate.promise; return 'late-source-read'
      }).catch(() => undefined)
      await entered.promise
    })
    void owner.then(() => { settled = true }, () => { settled = true })
    await entered.promise; await Promise.resolve(); await Promise.resolve(); expect(settled).toBe(false)
    gate.resolve(); await expect(owner).rejects.toThrow()
  })

  it('rejects reentrant publication and prevents a caught nested failure from committing', async () => {
    const f = fixture()
    await expect(f.owner(async before => {
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async () => {
        await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, async () => undefined).catch(() => undefined)
      }).catch(() => undefined)
    })).rejects.toThrow('reentrant')
  })

  it('rejects borrowing after synchronous terminal reservation before its asynchronous queue settles', async () => {
    const f = fixture(); const operation = vi.fn(async () => undefined)
    await expect(f.owner(async (before, queue) => {
      const terminal = queue(f.tx, scope, { attemptId: 'attempt-joined', workItemId: 'work-joined',
        authorizationId: 'auth-joined', resultHash: `sha256:${'a'.repeat(64)}`, terminalStatus: 'COMPLETED' })
      await withJourneySharedResourcePublicationInTransaction(f.tx, scope, before, operation).catch(() => undefined)
      await terminal.catch(() => undefined)
    })).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
  })

  it('removes the exact callback association on both successful and failed owner closure', async () => {
    const f = fixture(); let successful!: BeforeJourneyBusinessWrite; let failed!: BeforeJourneyBusinessWrite
    await f.owner(async before => { successful = before })
    await expect(f.owner(async before => { failed = before; throw new Error('OWNER_FAILURE') })).rejects.toThrow('OWNER_FAILURE')
    for (const before of [successful, failed]) await expect(withJourneySharedResourcePublicationInTransaction(f.tx, scope,
      before, async admit => { await admit() })).rejects.toThrow('unrecognized')
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })
})
