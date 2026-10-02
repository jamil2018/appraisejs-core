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
    intent: 'QUALITY_JOURNEY',
    status: 'COMPLETED',
    result: 'PASSED',
    evidenceHealth: 'valid',
    reportPath: '/verified/report.json',
    logPath: '/verified/run.log',
    environmentSnapshotHash: hashRuntimeCapsuleValue({}),
    runtimeCapsuleExecutionAttempt: { id: 'attempt-1' },
    testCases: [],
    reports: [],
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
        status: 'ACTIVE',
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
  it.each([
    ['PASSED', 'COMPLETED'],
    ['FAILED', 'FAILED'],
    ['CANCELLED', 'CANCELLED'],
  ])('terminalizes a sealed %s run binding as %s without another runtime effect', async (result, bindingStatus) => {
    const { client, run } = fixture()
    if (result === 'CANCELLED') run.status = 'CANCELLED'
    run.result = result
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(client.qualityJourneyExecutionTestRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'binding-1', status: { in: ['LAUNCHING', 'RUNNING'] } },
      data: { status: bindingStatus },
    })
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).toHaveBeenCalledOnce()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
  it('repairs a historical terminal cycle only when its sealed receipt covers the terminal run', async () => {
    const { client, binding, cycle } = fixture()
    // Historically sealed cycles have already advanced the lifecycle.
    const journey = await client.qualityJourney.findUniqueOrThrow()
    client.qualityJourney.findUniqueOrThrow.mockResolvedValue({ ...journey, stage: 'TRIAGE' })
    cycle.status = 'COMPLETED'
    client.qualityJourneyExecutionEvidenceReceipt.count.mockResolvedValue(1)
    client.qualityJourneyExecutionCycle.findUniqueOrThrow.mockResolvedValue({
      ...cycle,
      evidenceReceipts: [{ id: 'receipt-1', testRunId: binding.testRunId, receiptHash: 'unchanged' }],
    } as never)
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(client.qualityJourneyExecutionTestRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'binding-1', status: { in: ['LAUNCHING', 'RUNNING'] } },
      data: { status: 'COMPLETED' },
    })
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
  it('does not repair a historical sealed binding after its Journey closes', async () => {
    const { client, binding, cycle } = fixture()
    cycle.status = 'COMPLETED'
    client.qualityJourneyExecutionEvidenceReceipt.count.mockResolvedValue(1)
    client.qualityJourneyExecutionCycle.findUniqueOrThrow.mockResolvedValue({
      ...cycle,
      evidenceReceipts: [{ id: 'receipt-1', testRunId: binding.testRunId, receiptHash: 'unchanged' }],
    } as never)
    client.qualityJourney.findUniqueOrThrow.mockResolvedValue({
      id: 'journey-1',
      targetProjectId: 'target-1',
      stage: 'CLOSED',
      status: 'CLOSED',
      activeCycleId: 'cycle-1',
      stateHash: hashRuntimeCapsuleValue({}),
    })
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never),
    ).rejects.toThrow('Closed Quality Journeys are immutable')
    expect(client.qualityJourneyExecutionTestRun.updateMany).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionCycle.update).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
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
  it('rejects an independent TestRun linked to a Journey binding before sealing evidence', async () => {
    const { client, run } = fixture()
    run.intent = 'INDEPENDENT'
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never),
    ).rejects.toThrow('Journey-owned TestRun')
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('rejects a mismatched run identity and an orphaned capsule attempt', async () => {
    const wrongRun = fixture()
    wrongRun.run.runId = 'independent-run'
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, wrongRun.client as never),
    ).rejects.toThrow('Journey-owned TestRun')
    const orphaned = fixture()
    Object.assign(orphaned.run, { runtimeCapsule: null })
    await expect(
      reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, orphaned.client as never),
    ).rejects.toThrow('capsule attempt')
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
  it('keeps an uncertain launch claimed after a lost reply', async () => {
    const { client, binding, run } = fixture()
    binding.status = 'LAUNCHING'
    run.status = 'QUEUED'
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionTestRun.updateMany).not.toHaveBeenCalled()
  })
  it('does not admit a reserved launch while its Journey is paused', async () => {
    const { client, binding, run } = fixture()
    binding.status = 'RESERVED'
    run.status = 'QUEUED'
    const journey = await client.qualityJourney.findUniqueOrThrow()
    client.qualityJourney.findUniqueOrThrow.mockResolvedValue({ ...journey, status: 'PAUSED' })
    await startQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(client.qualityJourneyExecutionTestRun.updateMany).not.toHaveBeenCalled()
  })
  it('seals terminal bytes during pause and defers lifecycle publication until resume', async () => {
    const { client, cycle } = fixture()
    const journey = await client.qualityJourney.findUniqueOrThrow()
    client.qualityJourney.findUniqueOrThrow.mockResolvedValue({ ...journey, status: 'PAUSED' })
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).toHaveBeenCalledTimes(1)
    expect(mocks.publish).not.toHaveBeenCalled()
    cycle.status = 'COMPLETED'
    Object.assign(cycle, { evidenceReceipts: [{ id: 'sealed-1', testRunId: 'test-1' }] })
    client.qualityJourneyExecutionEvidenceReceipt.count.mockResolvedValue(1)
    client.qualityJourney.findUniqueOrThrow.mockResolvedValue(journey)
    await reconcileQualityJourneyExecutionRuntime({ executionCycleId: 'execution-1' }, client as never)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(client.qualityJourneyExecutionEvidenceReceipt.create).toHaveBeenCalledTimes(1)
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
