import { TestRunStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnedProcessStopError } from '@/lib/process/owned-process-stop'
import type { RetainedExecutionIdentity } from '@/services/coordinator/quality-journey-shared-resource-use-service'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'

// Unit composition ONLY: the real conservative business reader is retained.
// This inert retained-reader substitution proves caller placement, not source
// integrity, persisted rollback, protected effect authority or physical spawn.
const { retained, execute, stop, observe, schedule } = vi.hoisted(() => ({
  retained: vi.fn(),
  execute: vi.fn(),
  stop: vi.fn(),
  observe: vi.fn(),
  schedule: vi.fn(),
}))
vi.mock('@/services/coordinator/quality-journey-shared-resource-use-service', () => ({
  validateRetainedExecutionUseForTestRunInTransaction: retained,
}))
vi.mock('@/lib/process/owned-process-stop', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/process/owned-process-stop')>()),
  stopOwnedProcessGroup: stop,
}))
vi.mock('@/lib/executor/capsule-executor-adapter', () => ({
  CapsuleExecutorAdapter: class {
    execute = execute
    waitForProcess = vi.fn()
    releaseTerminalProcess = vi.fn()
  },
}))
vi.mock('./runtime-capsule-stop-service', () => ({
  persistObservedCapsuleStop: observe,
  cancelRuntimeCapsuleTestRun: vi.fn(),
  reconcileCancelledCapsuleTestRun: vi.fn(),
  registerCapsuleTerminalCallback: vi.fn(),
}))
vi.mock('./test-run-service', () => ({ scheduleTestRunCompletion: schedule }))
vi.mock('@/lib/test-run/winston-logger', () => ({ createTestRunLogger: vi.fn(async () => ({})) }))

// Deterministic synthetic unit data only, never persisted identity or admission proof.
// Repeated hex digits distinguish fixture digests without borrowing real evidence.
const executionIdentityBase = Object.freeze({
  intent: 'QUALITY_JOURNEY',
  journeyId: 'r09-journey',
  targetProjectId: 'r09-target',
  executionCycleId: 'r09-execution-cycle',
  executionJourneyCycleId: 'r09-journey-cycle',
  executionBindingId: 'r09-binding',
  preparedCapsuleId: 'r09-capsule',
  testRunDbId: 'r09-run-db',
  runId: 'r09-run-public',
  preparedCapsulesHash: '1111111111111111111111111111111111111111111111111111111111111111',
} satisfies Omit<RetainedExecutionIdentity, 'resourceUse'>)
const legacyExecutionIdentity: RetainedExecutionIdentity = Object.freeze({
  ...executionIdentityBase,
  resourceUse: Object.freeze({ kind: 'LEGACY_UNPROTECTED' } satisfies RetainedExecutionIdentity['resourceUse']),
})
const protectedExecutionIdentity: RetainedExecutionIdentity = Object.freeze({
  ...executionIdentityBase,
  resourceUse: Object.freeze({
    kind: 'E2_RETAINED_USE',
    useId: 'r09-synthetic-unit-use',
    coordinatorSessionId: 'r09-session',
    generation: 1,
    sourceKind: 'EXECUTION_CYCLE',
    sourceOwnerId: executionIdentityBase.executionCycleId,
    sourceDigest: '2222222222222222222222222222222222222222222222222222222222222222',
    dependencyDigest: '3333333333333333333333333333333333333333333333333333333333333333',
    claimSetDigest: '4444444444444444444444444444444444444444444444444444444444444444',
    claimSetCount: 1,
  } satisfies RetainedExecutionIdentity['resourceUse']),
})

beforeEach(() => {
  vi.resetAllMocks()
  retained.mockResolvedValue({
    protection: 'LEGACY',
    runSourceHash: 'inert-unit-evidence',
    executionIdentity: legacyExecutionIdentity,
  })
  observe.mockResolvedValue(undefined)
  schedule.mockImplementation(async ({ launch }: { launch: () => Promise<unknown> }) => launch())
})

function fixture(protection: 'LEGACY' | 'PROTECTED_E2' = 'LEGACY') {
  const executionIdentity = protection === 'LEGACY' ? legacyExecutionIdentity : protectedExecutionIdentity
  const events: string[] = []
  let status: TestRunStatus = TestRunStatus.RUNNING
  let journeyStatus = 'ACTIVE'
  let fenceCount = 1
  let sessionId: string | null = null
  const attempt = { id: 'r09-attempt', ownerToken: 'r09-owner', version: 1 }
  const tx = {
    qualityJourneyExecutionTestRun: {
      findUnique: vi.fn(async () => {
        events.push('binding')
        return {
          executionCycle: {
            targetProjectId: 'r09-target',
            status: 'RUNNING',
            journey: { id: 'r09-journey', status: journeyStatus, version: 7 },
          },
        }
      }),
    },
    qualityJourney: {
      findFirst: vi.fn(async () => {
        events.push('business')
        return { id: 'r09-journey', targetProjectId: 'r09-target', currentCoordinatorSessionId: sessionId }
      }),
      updateMany: vi.fn(async () => {
        events.push('fence')
        return { count: fenceCount }
      }),
    },
    qualityJourneyE2Retirement: { findFirst: vi.fn(async () => null) },
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async () => ({
        id: sessionId,
        journeyId: 'r09-journey',
        targetProjectId: 'r09-target',
        e2EnrollmentKind: 'E2_V1',
        e2EnrollmentDigest: 'inert-enrollment',
        e2EnrolledAt: new Date('2026-10-28T00:00:00.000Z'),
      })),
    },
    testRun: {
      findUniqueOrThrow: vi.fn(async () => ({ status })),
      findUnique: vi.fn(async () => ({ status })),
      updateMany: vi.fn(async () => {
        events.push('run-claim')
        return { count: 1 }
      }),
    },
    runtimeCapsuleExecutionAttempt: {
      upsert: vi.fn(async () => {
        events.push('attempt-upsert')
        return attempt
      }),
      updateMany: vi.fn(async () => {
        events.push('attempt-running')
        return { count: 1 }
      }),
    },
  }
  const client = {
    testRun: {
      update: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => ({ status })),
      updateMany: vi.fn(async ({ data }: { data: { status: TestRunStatus } }) => {
        status = data.status
        return { count: 1 }
      }),
    },
    runtimeCapsuleExecutionAttempt: {
      findUniqueOrThrow: vi.fn(async () => ({ state: 'STARTING', ownerToken: attempt.ownerToken })),
    },
    // Deliberately distinct from the root client. This callback harness does not
    // simulate SQL isolation/rollback and is never asserted to prove those.
    $transaction: vi.fn(async <T>(operation: (value: typeof tx) => Promise<T>) => {
      events.push('transaction')
      return operation(tx)
    }),
  }
  retained.mockImplementation(async (actualTx: unknown, runId: string) => {
    expect(actualTx).toBe(tx)
    expect(runId).toBe('r09-run-db')
    events.push('retained')
    return { protection, runSourceHash: 'inert-unit-evidence', executionIdentity }
  })
  const input = {
    expectedExecutionIdentity: executionIdentity,
    testRun: {
      id: 'r09-run-db',
      runId: 'r09-run-public',
      targetProjectId: 'r09-target',
      environmentId: 'r09-environment',
      intent: 'QUALITY_JOURNEY',
      status: TestRunStatus.RUNNING,
      environment: { id: 'r09-environment' } as never,
      targetProject: { kind: 'LOCAL_WORKSPACE' },
    },
    materialized: {
      row: { id: 'r09-capsule', validationHash: 'inert-hash' },
      manifest: { commandReceipt: { hash: 'inert-receipt' } },
    },
    paths: { capsuleRoot: '/tmp/r09-inert-not-created' } as never,
    attempt,
    remoteScopeRequired: false,
    label: 'Journey' as const,
    beforeSpawnError: 'R09 before spawn',
    verifyRunStatusAfterSpawn: true,
  }
  const service = new RuntimeCapsuleTestRunService(client as never)
  const reserve = (intent: 'QUALITY_JOURNEY' | 'INDEPENDENT' = 'QUALITY_JOURNEY') =>
    service['reserveCapsuleAttempt']({
      testRun: input.testRun,
      intent,
      expectedExecutionIdentity: executionIdentity,
      materialized: input.materialized,
      preflight: { checkedAt: '2026-10-28T00:00:00.000Z' },
    })
  const preSpawn = () => service['assertReadyBeforeSpawn'](input)
  const postSpawn = () =>
    service['transitionAttemptToRunning']({
      attempt,
      testRunId: input.testRun.id,
      verifyRunStatus: true,
      journey: true,
      expectedExecutionIdentity: executionIdentity,
    })
  return {
    client,
    tx,
    service,
    input,
    events,
    reserve,
    preSpawn,
    postSpawn,
    pause: () => {
      journeyStatus = 'PAUSED'
    },
    loseFence: () => {
      fenceCount = 0
    },
    enroll: () => {
      sessionId = 'r09-session'
    },
    status: () => status,
  }
}

describe('R09 actual caller unit composition (not persisted/runtime qualification)', () => {
  it('R09-O1 repeats the exact tx/run read before business, fence and each caller mutation', async () => {
    const f = fixture()
    await f.reserve()
    expect(f.events).toEqual(['transaction', 'retained', 'binding', 'business', 'fence', 'run-claim', 'attempt-upsert'])
    f.events.length = 0
    await f.preSpawn()
    expect(f.events).toEqual(['transaction', 'retained', 'binding', 'business', 'fence'])
    f.events.length = 0
    await expect(f.postSpawn()).resolves.toBe(true)
    expect(f.events).toEqual(['transaction', 'retained', 'binding', 'business', 'fence', 'attempt-running'])
    expect(retained).toHaveBeenCalledTimes(3)
    expect(f.tx.qualityJourney.findFirst).toHaveBeenCalledWith({
      where: { id: 'r09-journey', targetProjectId: 'r09-target' },
    })
    expect(f.tx.qualityJourney.updateMany).toHaveBeenCalledWith({
      where: { id: 'r09-journey', status: 'ACTIVE', version: 7 },
      data: { updatedAt: expect.any(Date) },
    })
  })

  it('R09-O2 preserves status/version refusals and keeps independent reserve outside the Journey reader', async () => {
    const f = fixture()
    f.pause()
    await expect(f.reserve()).rejects.toThrow('paused or cancelling')
    expect(f.tx.qualityJourney.updateMany).not.toHaveBeenCalled()
    const g = fixture()
    g.loseFence()
    await expect(g.reserve()).rejects.toThrow('pause fence changed')
    expect(g.tx.testRun.updateMany).not.toHaveBeenCalled()
    retained.mockClear()
    await g.reserve('INDEPENDENT')
    expect(retained).not.toHaveBeenCalled()
  })

  it.each(['LEGACY', 'PROTECTED_E2'] as const)(
    'R09-O3 retains real E2 enrollment refusal after an inert %s reader result',
    async protection => {
      const f = fixture(protection)
      f.enroll()
      retained.mockResolvedValue({
        protection,
        runSourceHash: 'inert-evidence-only',
        executionIdentity: f.input.expectedExecutionIdentity,
      })
      await expect(f.reserve()).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { reason: 'UNSUPPORTED_E2_INVALIDATION' },
      })
      expect(f.tx.qualityJourney.updateMany).not.toHaveBeenCalled()
      expect(f.tx.testRun.updateMany).not.toHaveBeenCalled()
      expect(f.tx.runtimeCapsuleExecutionAttempt.upsert).not.toHaveBeenCalled()
    },
  )

  it('R09-O3 never downgrades an inert protected result when current enrollment appears legacy', async () => {
    const f = fixture('PROTECTED_E2')
    retained.mockResolvedValue({
      protection: 'PROTECTED_E2',
      runSourceHash: 'not-an-effect-grant',
      executionIdentity: f.input.expectedExecutionIdentity,
    })
    await expect(f.reserve()).rejects.toMatchObject({ details: { reason: 'UNSUPPORTED_E2_INVALIDATION' } })
    expect(f.tx.qualityJourney.updateMany).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(['reserve', 'preSpawn', 'postSpawn'] as const)(
    'R09-O4 propagates a fresh retained-reader refusal at %s before owner mutations',
    async site => {
      const f = fixture()
      if (site !== 'reserve') await f.reserve()
      if (site === 'postSpawn') await f.preSpawn()
      vi.mocked(f.tx.qualityJourney.updateMany).mockClear()
      vi.mocked(f.tx.runtimeCapsuleExecutionAttempt.updateMany).mockClear()
      retained.mockRejectedValueOnce(new Error('synthetic stale source/Use/lineage refusal'))
      await expect(f[site]()).rejects.toThrow('synthetic stale source/Use/lineage refusal')
      expect(f.tx.qualityJourney.updateMany).not.toHaveBeenCalled()
      expect(f.tx.runtimeCapsuleExecutionAttempt.updateMany).not.toHaveBeenCalled()
      if (site === 'preSpawn') {
        expect(f.status()).toBe(TestRunStatus.CANCELLING)
        expect(observe).toHaveBeenCalledWith(
          f.client,
          expect.objectContaining({
            testRunId: 'r09-run-db',
            attemptId: 'r09-attempt',
            ownerToken: 'r09-owner',
            observation: expect.objectContaining({ kind: 'never_started' }),
          }),
        )
      }
    },
  )

  it('R09-O5 invokes zero inert execute calls on pre-spawn refusal and records exact never-started scope', async () => {
    const f = fixture()
    retained.mockRejectedValueOnce(new Error('refused before execute'))
    await expect(f.service['scheduleReservedCapsule'](f.input)).rejects.toThrow('refused before execute')
    expect(execute).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledTimes(1)
    expect(f.status()).toBe(TestRunStatus.CANCELLING)
  })

  it('R09-O5 invokes one inert execute then existing owned stop on post-spawn refusal without never-started', async () => {
    const f = fixture()
    const process = { name: 'r09-inert-process' }
    execute.mockImplementationOnce(async () => {
      retained.mockRejectedValueOnce(new Error('refused registration'))
      return { process }
    })
    const observation = { kind: 'group_exit_observed', observedAt: '2026-10-28T00:00:00.000Z' }
    stop.mockResolvedValueOnce(observation)
    await expect(f.service['scheduleReservedCapsule'](f.input)).rejects.toThrow('refused registration')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledExactlyOnceWith(process)
    expect(observe).toHaveBeenCalledExactlyOnceWith(f.client, {
      testRunId: 'r09-run-db',
      runId: 'r09-run-public',
      attemptId: 'r09-attempt',
      ownerToken: 'r09-owner',
      observation,
    })
    expect(f.tx.runtimeCapsuleExecutionAttempt.updateMany).not.toHaveBeenCalled()
    expect(f.status()).toBe(TestRunStatus.CANCELLING)
  })

  it('R09-O6 leaves failed post-spawn stop unresolved without a false observation or retry', async () => {
    const f = fixture()
    execute.mockImplementationOnce(async () => {
      retained.mockRejectedValueOnce(new Error('retired before registration'))
      return { process: { name: 'r09-inert-process' } }
    })
    stop.mockRejectedValueOnce(new OwnedProcessStopError('exit_unverified', 'synthetic unresolved stop'))
    await expect(f.service['scheduleReservedCapsule'](f.input)).rejects.toThrow('synthetic unresolved stop')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(observe).not.toHaveBeenCalled()
    expect(f.status()).toBe(TestRunStatus.CANCELLING)
  })
})
