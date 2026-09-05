import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  readBytes: vi.fn(),
  process: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  publish: vi.fn(),
}))
vi.mock('@/lib/test-run/process-manager', () => ({ processManager: { get: mocks.process } }))
vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mocks.readBytes
  },
}))
vi.mock('@/services/test-run/runtime-capsule-test-run-service', () => ({
  RuntimeCapsuleTestRunService: class {
    startJourneyPrepared = mocks.start
    cancel = mocks.cancel
  },
}))
vi.mock('./quality-journey-service', () => ({ submitDurableQualityJourneyCommandInTransaction: mocks.publish }))
vi.mock('@/lib/runtime-capsule', async () => {
  const actual = await import('@/lib/runtime-capsule/contracts')
  return { ...actual, parseCanonicalRuntimeCapsuleManifest: JSON.parse }
})
import {
  cancelQualityJourneyExecutionRuntime,
  reconcileQualityJourneyExecutionRuntime,
  startQualityJourneyExecutionRuntime,
} from './quality-journey-runtime-service'
import { hashRuntimeCapsuleValue, hashRuntimeCapsuleBytes } from '@/lib/runtime-capsule/contracts'

function fixture() {
  const manifest = {
    projectId: 'target-1',
    runId: 'run-1',
    source: {
      kind: 'AUTHORED_TEST_SNAPSHOT',
      snapshot: { journey: { executionCycleId: 'execution-1', preparedCapsuleId: 'prepared-1' } },
    },
  }
  const run = {
    id: 'test-1',
    runId: 'run-1',
    targetProjectId: 'target-1',
    status: 'COMPLETED',
    result: 'PASSED',
    evidenceHealth: 'valid',
    reportPath: '/verified/report.json',
    logPath: '/verified/run.log',
    environmentSnapshotHash: hashRuntimeCapsuleValue({}),
    runtimeCapsuleExecutionAttempt: { id: 'attempt-1' },
    testCases: [],
    runtimeCapsule: {
      id: 'capsule-1',
      testRunId: 'test-1',
      capsuleHash: hashRuntimeCapsuleValue({}),
      manifestHash: hashRuntimeCapsuleValue(manifest),
      manifestJson: JSON.stringify(manifest),
    },
  }
  const binding = {
    id: 'binding-1',
    testRunId: 'test-1',
    runId: 'run-1',
    preparedCapsuleId: 'prepared-1',
    status: 'RUNNING',
    testRun: run,
  }
  const cycle = {
    id: 'execution-1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    cycleId: 'cycle-1',
    status: 'RUNNING',
    environmentSnapshotHash: hashRuntimeCapsuleValue({}),
    preparedCapsulesJson: JSON.stringify([{ preparedCapsuleId: 'prepared-1' }]),
    preparedCapsulesHash: hashRuntimeCapsuleValue([{ preparedCapsuleId: 'prepared-1' }]),
    testRuns: [binding],
  }
  const client = {
    qualityJourneyExecutionCycle: { findUniqueOrThrow: vi.fn(async () => cycle), update: vi.fn(), updateMany: vi.fn() },
    qualityJourneyExecutionTestRun: { update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    qualityJourneyExecutionEvidenceReceipt: { count: vi.fn(async () => 0), create: vi.fn() },
    qualityJourney: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'journey-1',
        targetProjectId: 'target-1',
        stage: 'EXECUTION',
        activeCycleId: 'cycle-1',
        stateHash: hashRuntimeCapsuleValue({}),
      })),
    },
    $transaction: async (fn: (db: unknown) => Promise<unknown>) => fn(client),
  }
  return { client, binding, run, cycle }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.process.mockReturnValue(undefined)
  mocks.publish.mockResolvedValue({ outcome: 'COMMITTED' })
  mocks.readBytes.mockImplementation(async ({ kind }) => ({ bytes: Buffer.from(`${kind}-actual-output`) }))
})

describe('Journey managed runtime evidence and ownership', () => {
  it('seals actual verified bytes with exact run/capsule/cycle lineage', async () => {
    const { client } = fixture()
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    const receipt = client.qualityJourneyExecutionEvidenceReceipt.create.mock.calls[0]?.[0] as unknown as {
      data: { evidenceJson: string; runtimeBytesHash: string }
    }
    const evidence = JSON.parse(receipt.data.evidenceJson)
    expect(evidence.artifacts).toContainEqual({
      kind: 'report',
      contentHash: hashRuntimeCapsuleBytes(Buffer.from('report-actual-output')),
      size: 20,
    })
    expect(evidence).toMatchObject({
      executionCycleId: 'execution-1',
      preparedCapsuleId: 'prepared-1',
      runtimeCapsuleId: 'capsule-1',
    })
    expect(receipt.data.runtimeBytesHash).toBe(hashRuntimeCapsuleValue(evidence.artifacts))
    expect(mocks.publish).toHaveBeenCalledOnce()
  })
  it('rejects a foreign prepared capsule even when no runtime capsule was produced', async () => {
    const { client, binding, run } = fixture()
    binding.preparedCapsuleId = 'foreign-prepared'
    run.result = 'FAILED'
    Object.assign(run, { runtimeCapsule: null })
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never),
    ).rejects.toThrow('outside its frozen execution scope')
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
  })
  it('cannot seal while the process is still registered', async () => {
    const { client } = fixture()
    mocks.process.mockReturnValue({})
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(mocks.readBytes).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
  })
  it('rejects a successful run with missing report bytes', async () => {
    const { client, run } = fixture()
    run.reportPath = ''
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never),
    ).rejects.toThrow('complete valid')
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
  })
  it('does not relaunch an already claimed run after reconnect', async () => {
    const { client, run } = fixture()
    run.status = 'RUNNING'
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('refuses cancellation without process ownership instead of claiming a successful kill', async () => {
    const { client, run } = fixture()
    run.status = 'RUNNING'
    await expect(
      cancelQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1', reason: 'stop' }, client as never),
    ).rejects.toThrow('ownership is unavailable')
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionTestRun.update).toHaveBeenCalledWith({
      where: { id: 'binding-1' },
      data: { status: 'OWNERSHIP_LOST' },
    })
  })
  it('rejects foreign cancellation selections', async () => {
    const { client } = fixture()
    await expect(
      cancelQualityJourneyExecutionRuntime(
        { executionCycleId: 'execution-1', reason: 'stop', testRunIds: ['foreign'] },
        client as never,
      ),
    ).rejects.toThrow('outside this cycle')
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
})
