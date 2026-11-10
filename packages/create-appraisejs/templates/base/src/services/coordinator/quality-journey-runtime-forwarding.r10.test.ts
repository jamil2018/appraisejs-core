import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { RetainedExecutionIdentity } from './quality-journey-shared-resource-use-service'
import { startQualityJourneyExecutionRuntime } from './quality-journey-runtime-service'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  group: vi.fn(),
  materialize: vi.fn(),
  schedule: vi.fn(),
}))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/services/test-run/runtime-capsule-stop-service', () => ({
  cancelRuntimeCapsuleTestRun: vi.fn(),
  persistObservedCapsuleStop: vi.fn(),
  reconcileCancelledCapsuleTestRun: vi.fn(),
  registerCapsuleTerminalCallback: vi.fn(),
}))
vi.mock('./quality-journey-shared-resource-use-service', () => ({
  validateRetainedExecutionUseForTestRunInTransaction: mocks.validate,
}))
vi.mock('./quality-journey-business-write-join', () => ({
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction: mocks.group,
}))
vi.mock('@/services/test-run/test-run-service', () => ({ scheduleTestRunCompletion: mocks.schedule }))
vi.mock('@/lib/runtime-capsule', async () => ({
  ...(await import('@/lib/runtime-capsule/contracts')),
  RuntimeCapsuleMaterializer: class {
    materializeJourneyPrepared = mocks.materialize
  },
  RuntimeCapsulePreflight: class {},
  resolveRuntimeCapsulePaths: vi.fn(),
}))
vi.mock('./quality-journey-service', () => ({ submitDurableQualityJourneyCommandInTransaction: vi.fn() }))

function executionIdentity(protectedUse = false): RetainedExecutionIdentity {
  return Object.freeze({
    intent: 'QUALITY_JOURNEY',
    journeyId: 'journey',
    targetProjectId: 'project',
    executionCycleId: 'execution',
    executionJourneyCycleId: 'phaseCycle',
    executionBindingId: 'binding',
    preparedCapsuleId: 'prepared',
    testRunDbId: 'dbRun',
    runId: 'run',
    preparedCapsulesHash: `sha256:${'a'.repeat(64)}`,
    resourceUse: protectedUse
      ? Object.freeze({
          kind: 'E2_RETAINED_USE',
          useId: 'use',
          coordinatorSessionId: 'session',
          generation: 1,
          sourceKind: 'EXECUTION_CYCLE',
          sourceOwnerId: 'execution',
          sourceDigest: 'b'.repeat(64),
          dependencyDigest: 'c'.repeat(64),
          claimSetDigest: 'd'.repeat(64),
          claimSetCount: 1,
        })
      : Object.freeze({ kind: 'LEGACY_UNPROTECTED' }),
  })
}

function launchHarness() {
  const run = { id: 'dbRun', runId: 'run', intent: 'QUALITY_JOURNEY', targetProjectId: 'project', status: 'QUEUED' }
  const binding = {
    id: 'binding',
    testRunId: 'dbRun',
    runId: 'run',
    preparedCapsuleId: 'prepared',
    executionCycleId: 'execution',
    status: 'RESERVED',
    testRun: run,
  }
  const cycle = {
    id: 'execution',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'phaseCycle',
    status: 'RESERVED',
    testRuns: [binding],
  }
  const journey = { id: 'journey', status: 'ACTIVE', version: 1 }
  const tx = {
    qualityJourneyExecutionCycle: {
      findUniqueOrThrow: vi.fn(async () => cycle),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    qualityJourneyExecutionTestRun: {
      findUniqueOrThrow: vi.fn(async () => binding),
      findUnique: vi.fn(async () => ({
        executionCycle: { targetProjectId: 'project', status: cycle.status, journey },
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    qualityJourney: { findUniqueOrThrow: vi.fn(async () => journey), updateMany: vi.fn(async () => ({ count: 1 })) },
    qualityJourneyExecutionEvidenceReceipt: { count: vi.fn(async () => 0) },
    testRun: {
      findUnique: vi.fn(async () => ({ status: 'RUNNING' })),
      findUniqueOrThrow: vi.fn(async () => ({ status: 'RUNNING' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    runtimeCapsuleExecutionAttempt: {
      findUniqueOrThrow: vi.fn(async () => ({ state: 'STARTING', ownerToken: 'owner' })),
    },
    $transaction: vi.fn(),
  }
  tx.$transaction.mockImplementation(async callback => callback(tx))
  return { tx, run, binding, cycle, client: tx as unknown as PrismaClient }
}

type AdmissionOwner = {
  assertJourneyLaunchAdmitted(
    tx: Prisma.TransactionClient,
    id: string,
    expected?: RetainedExecutionIdentity,
  ): Promise<void>
}

describe('R10 inert exact Journey identity forwarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('captures and forwards exact stable identity despite mutable local source hashes', async () => {
    const { client } = launchHarness()
    const identity = executionIdentity()
    mocks.validate.mockResolvedValue({
      protection: 'LEGACY',
      runSourceHash: 'mutable-at-claim',
      executionIdentity: identity,
    })
    const start = vi
      .spyOn(RuntimeCapsuleTestRunService.prototype, 'startJourneyPrepared')
      .mockResolvedValue({} as never)
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution' }, client, 'offline-only-root')
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ testRunDbId: 'dbRun', expectedExecutionIdentity: identity }),
    )
    mocks.validate.mockResolvedValue({
      protection: 'LEGACY',
      runSourceHash: 'changed-after-claim',
      executionIdentity: identity,
    })
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as AdmissionOwner
    await expect(
      owner.assertJourneyLaunchAdmitted(launchHarness().tx as unknown as Prisma.TransactionClient, 'dbRun', identity),
    ).resolves.toBeUndefined()
  })

  it('does not respawn an interrupted LAUNCHING binding or claim a foreign reservation', async () => {
    const { client, binding } = launchHarness()
    const start = vi
      .spyOn(RuntimeCapsuleTestRunService.prototype, 'startJourneyPrepared')
      .mockResolvedValue({} as never)
    binding.status = 'LAUNCHING'
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution' }, client, 'offline-only-root')
    expect(start).not.toHaveBeenCalled()
    const foreign = launchHarness()
    foreign.binding.executionCycleId = 'foreign'
    await expect(
      startQualityJourneyExecutionRuntime({ executionCycleId: 'execution' }, foreign.client, 'offline-only-root'),
    ).rejects.toMatchObject({ details: { reason: 'FROZEN_EXECUTION_IDENTITY_MISMATCH' } })
    expect(start).not.toHaveBeenCalled()
  })

  it.each([
    'journeyId',
    'targetProjectId',
    'executionCycleId',
    'executionJourneyCycleId',
    'executionBindingId',
    'preparedCapsuleId',
    'testRunDbId',
    'runId',
    'preparedCapsulesHash',
    'intent',
  ] as const)('refuses changed %s in actual admission owner', async field => {
    const { tx, client } = launchHarness()
    const expected = executionIdentity()
    mocks.validate.mockResolvedValue({
      protection: 'LEGACY',
      runSourceHash: 'irrelevant',
      executionIdentity: { ...expected, [field]: 'foreign' },
    })
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as AdmissionOwner
    await expect(
      owner.assertJourneyLaunchAdmitted(tx as unknown as Prisma.TransactionClient, 'dbRun', expected),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'FROZEN_EXECUTION_IDENTITY_MISMATCH' } })
    expect(tx.qualityJourney.updateMany).not.toHaveBeenCalled()
    expect(mocks.materialize).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it.each([
    'useId',
    'coordinatorSessionId',
    'generation',
    'sourceKind',
    'sourceOwnerId',
    'sourceDigest',
    'dependencyDigest',
    'claimSetDigest',
    'claimSetCount',
  ] as const)('refuses changed retained %s without downgrade', async field => {
    const { tx, client } = launchHarness()
    const expected = executionIdentity(true)
    const changed = {
      ...expected,
      resourceUse: {
        ...expected.resourceUse,
        [field]: field === 'generation' || field === 'claimSetCount' ? 2 : 'foreign',
      },
    }
    mocks.validate.mockResolvedValue({
      protection: 'PROTECTED_E2',
      runSourceHash: 'irrelevant',
      executionIdentity: changed,
    })
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as AdmissionOwner
    await expect(
      owner.assertJourneyLaunchAdmitted(tx as unknown as Prisma.TransactionClient, 'dbRun', expected),
    ).rejects.toMatchObject({ details: { reason: 'FROZEN_EXECUTION_IDENTITY_MISMATCH' } })
    expect(tx.qualityJourney.updateMany).not.toHaveBeenCalled()
  })

  it('preserves source validator release/retirement refusal and exact R09 protected no-start', async () => {
    const { tx, client } = launchHarness()
    const expected = executionIdentity(true)
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as AdmissionOwner
    mocks.validate.mockRejectedValueOnce(new Error('RETAINED_EXECUTION_RETIRED'))
    await expect(
      owner.assertJourneyLaunchAdmitted(tx as unknown as Prisma.TransactionClient, 'dbRun', expected),
    ).rejects.toThrow('RETAINED_EXECUTION_RETIRED')
    mocks.validate.mockResolvedValue({
      protection: 'PROTECTED_E2',
      runSourceHash: 'irrelevant',
      executionIdentity: expected,
    })
    await expect(
      owner.assertJourneyLaunchAdmitted(tx as unknown as Prisma.TransactionClient, 'dbRun', expected),
    ).rejects.toMatchObject({ details: { reason: 'UNSUPPORTED_E2_INVALIDATION' } })
    expect(tx.qualityJourney.updateMany).not.toHaveBeenCalled()
    expect(mocks.materialize).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('rechecks identity in reservation and pre-spawn owners before attempt/spawn effects', async () => {
    const { tx, client } = launchHarness()
    const expected = executionIdentity()
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as {
      reserveCapsuleAttempt(input: unknown): Promise<unknown>
      assertReadyBeforeSpawn(input: unknown): Promise<void>
    }
    mocks.validate.mockResolvedValueOnce({
      protection: 'LEGACY',
      runSourceHash: 'local',
      executionIdentity: { ...expected, runId: 'foreign' },
    })
    await expect(
      owner.reserveCapsuleAttempt({
        testRun: { id: 'dbRun' },
        intent: 'QUALITY_JOURNEY',
        expectedExecutionIdentity: expected,
      }),
    ).rejects.toMatchObject({ details: { reason: 'FROZEN_EXECUTION_IDENTITY_MISMATCH' } })
    expect(tx.testRun.updateMany).not.toHaveBeenCalled()
    mocks.validate.mockRejectedValueOnce(new Error('RETAINED_EXECUTION_USE_RELEASED'))
    await expect(
      owner.assertReadyBeforeSpawn({
        testRun: { id: 'dbRun', runId: 'run', intent: 'QUALITY_JOURNEY' },
        attempt: { id: 'attempt', ownerToken: 'owner' },
        expectedExecutionIdentity: expected,
        beforeSpawnError: 'not admitted',
      }),
    ).rejects.toThrow('RETAINED_EXECUTION_USE_RELEASED')
    expect(tx.testRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'dbRun', status: 'RUNNING' },
      data: { status: 'CANCELLING' },
    })
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('requires supplied identity even when retained legacy proof succeeds', async () => {
    const { tx, client } = launchHarness()
    mocks.validate.mockResolvedValue({
      protection: 'LEGACY',
      runSourceHash: 'irrelevant',
      executionIdentity: executionIdentity(),
    })
    const owner = new RuntimeCapsuleTestRunService(client) as unknown as AdmissionOwner
    await expect(
      owner.assertJourneyLaunchAdmitted(tx as unknown as Prisma.TransactionClient, 'dbRun'),
    ).rejects.toMatchObject({ details: { reason: 'FROZEN_EXECUTION_IDENTITY_MISMATCH' } })
  })
})
