import { TestRunStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnedProcessStopError } from '@/lib/process/owned-process-stop'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'
import { persistObservedCapsuleStop } from './runtime-capsule-stop-service'

const { stopOwned, getOwned, executeCapsule, scheduleCompletion, releaseCapsule } = vi.hoisted(() => ({
  stopOwned: vi.fn(),
  getOwned: vi.fn(),
  executeCapsule: vi.fn(),
  scheduleCompletion: vi.fn(),
  releaseCapsule: vi.fn(),
}))
vi.mock('@/lib/process/owned-process-stop', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/process/owned-process-stop')>()),
  stopOwnedProcessGroup: stopOwned,
}))
vi.mock('@/lib/test-run/process-manager', () => ({ processManager: { get: getOwned } }))
vi.mock('@/lib/executor/capsule-executor-adapter', () => ({
  CapsuleExecutorAdapter: class {
    execute = executeCapsule
    waitForProcess = vi.fn()
    releaseTerminalProcess = releaseCapsule
  },
}))
vi.mock('./test-run-service', () => ({ scheduleTestRunCompletion: scheduleCompletion }))
vi.mock('@/lib/test-run/winston-logger', () => ({ createTestRunLogger: vi.fn(async () => ({})) }))

beforeEach(() => vi.clearAllMocks())

function queuedRun(input: { intent: 'INDEPENDENT' | 'QUALITY_JOURNEY'; journeyBound: boolean }) {
  return {
    id: 'run-db',
    runId: 'run-public',
    targetProjectId: 'target',
    environmentId: 'environment',
    intent: input.intent,
    status: TestRunStatus.QUEUED,
    environment: { id: 'environment' },
    targetProject: { kind: 'LOCAL_WORKSPACE' },
    testCases: [],
    runtimeCapsuleExecutionAttempt: null,
    qualityJourneyExecutionBinding: input.journeyBound ? { id: 'binding' } : null,
  }
}

describe('TestRun Journey authority invariants', () => {
  it('rejects Journey intent without an exact Journey execution binding', async () => {
    const client = {
      testRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'QUALITY_JOURNEY', journeyBound: false })),
      },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startJourneyPrepared({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('specialized frozen execution boundary')
  })

  it('rejects a Journey binding on an independent diagnostic run', async () => {
    const client = {
      testRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'INDEPENDENT', journeyBound: true })),
      },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startIndependentAuthored({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('specialized frozen execution boundary')
  })

  it('rejects independent intent at the Journey execution boundary', async () => {
    const client = {
      testRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'INDEPENDENT', journeyBound: true })),
      },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startJourneyPrepared({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('invalid execution intent')
  })
})

function cancellationClient() {
  let status: TestRunStatus = TestRunStatus.RUNNING
  let attemptState = 'RUNNING'
  let stopReceiptJson: string | null = null
  const attempt = { id: 'attempt', testRunId: 'run-db', ownerToken: 'owner', state: attemptState, version: 2 }
  const binding = { executionCycleId: 'cycle' }
  const client = {
    testRun: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'run-db',
        runId: 'run-public',
        status,
        qualityJourneyExecutionBinding: binding,
      })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { status?: TestRunStatus | { in: TestRunStatus[] } }
          data: { status: TestRunStatus }
        }) => {
          const allowed = typeof where.status === 'object' ? where.status.in.includes(status) : where.status === status
          if (!allowed) return { count: 0 }
          status = data.status
          return { count: 1 }
        },
      ),
      findUnique: vi.fn(async () => ({ status })),
    },
    runtimeCapsuleExecutionAttempt: {
      findUnique: vi.fn(async () =>
        ['STARTING', 'RUNNING'].includes(attemptState) ? { ...attempt, state: attemptState } : null,
      ),
      updateMany: vi.fn(async ({ data }: { data: { state: string; stopReceiptJson: string } }) => {
        attemptState = data.state
        stopReceiptJson = data.stopReceiptJson
        return { count: 1 }
      }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(client)),
  }
  return { client, current: () => ({ status, attemptState, stopReceiptJson }) }
}

describe('owned capsule cancellation', () => {
  it('does not convert an unverified post-spawn stop into FAILED', async () => {
    const client = {
      testRun: { updateMany: vi.fn() },
      runtimeCapsuleExecutionAttempt: { updateMany: vi.fn() },
      testRunLog: { upsert: vi.fn() },
    }
    const service = new RuntimeCapsuleTestRunService(client as never)
    await service['failCapsuleStart']({
      testRun: { id: 'run-db', runId: 'run-public' } as never,
      intent: 'QUALITY_JOURNEY',
      ownedAttempt: { id: 'attempt', ownerToken: 'owner', version: 2 },
      failedComponent: 'execution',
      error: new OwnedProcessStopError('exit_unverified', 'group still live'),
    })
    expect(client.testRun.updateMany).not.toHaveBeenCalled()
    expect(client.runtimeCapsuleExecutionAttempt.updateMany).not.toHaveBeenCalled()
    expect(client.testRunLog.upsert).not.toHaveBeenCalled()
  })

  it('persists CANCELLING before the stop wait and only records a stop receipt after observation', async () => {
    const { client, current } = cancellationClient()
    getOwned.mockReturnValue({ pid: 1234 })
    let observe!: (value: unknown) => void
    stopOwned.mockReturnValueOnce(new Promise(resolve => (observe = resolve)))
    const cancellation = new RuntimeCapsuleTestRunService(client as never).cancel('run-db', 'cycle')
    await vi.waitFor(() => expect(current().status).toBe(TestRunStatus.CANCELLING))
    expect(current()).toMatchObject({ attemptState: 'RUNNING', stopReceiptJson: null })
    observe({
      kind: 'group_exit_observed',
      groupId: 1234,
      observedAt: '2026-10-02T00:00:00.000Z',
      supervisorProtocol: 'appraise.owned-supervisor/v1',
      runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
    })
    await expect(cancellation).resolves.toBe(true)
    expect(current().status).toBe(TestRunStatus.CANCELLING)
    expect(current().attemptState).toBe('CANCELLED')
    expect(JSON.parse(current().stopReceiptJson!)).toMatchObject({
      testRunId: 'run-db',
      runId: 'run-public',
      attemptId: 'attempt',
      kind: 'group_exit_observed',
      groupId: 1234,
    })
  })

  it('leaves cancellation pending when process ownership is lost across a restart', async () => {
    const { client, current } = cancellationClient()
    getOwned.mockReturnValue(undefined)
    await expect(new RuntimeCapsuleTestRunService(client as never).cancel('run-db', 'cycle')).rejects.toThrow(
      'ownership is unavailable',
    )
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLING, attemptState: 'RUNNING' })
    expect(current().stopReceiptJson).toBeNull()
  })

  it('does not record a stop receipt or terminal state when owned group exit cannot be verified', async () => {
    const { client, current } = cancellationClient()
    getOwned.mockReturnValue({ pid: 1234 })
    stopOwned.mockRejectedValueOnce(new Error('ps failed'))
    await expect(new RuntimeCapsuleTestRunService(client as never).cancel('run-db', 'cycle')).rejects.toThrow(
      'ps failed',
    )
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLING, attemptState: 'RUNNING' })
    expect(current().stopReceiptJson).toBeNull()
  })

  it('stops an already-admitted delayed spawn when the Journey pauses before registration', async () => {
    let journeyStatus = 'ACTIVE'
    let runStatus: TestRunStatus = TestRunStatus.RUNNING
    let attemptState = 'STARTING'
    let stopReceiptJson: string | null = null
    let releaseSpawn!: (value: unknown) => void
    executeCapsule.mockReturnValueOnce(new Promise(resolve => (releaseSpawn = resolve)))
    scheduleCompletion.mockImplementationOnce(async ({ launch }: { launch: () => Promise<unknown> }) => launch())
    stopOwned.mockResolvedValueOnce({
      kind: 'group_exit_observed',
      groupId: 34567,
      observedAt: '2026-10-02T00:00:00.000Z',
      supervisorProtocol: 'appraise.owned-supervisor/v1',
      runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
    })
    const client = {
      testRun: {
        update: vi.fn(async () => undefined),
        findUniqueOrThrow: vi.fn(async () => ({ status: runStatus })),
        findUnique: vi.fn(async () => ({ status: runStatus })),
        updateMany: vi.fn(async ({ data }: { data: { status: TestRunStatus } }) => {
          runStatus = data.status
          return { count: 1 }
        }),
      },
      runtimeCapsuleExecutionAttempt: {
        findUniqueOrThrow: vi.fn(async () => ({ state: attemptState, ownerToken: 'owner' })),
        updateMany: vi.fn(async ({ data }: { data: { state: string; stopReceiptJson: string } }) => {
          attemptState = data.state
          stopReceiptJson = data.stopReceiptJson
          return { count: 1 }
        }),
      },
      qualityJourneyExecutionTestRun: {
        findUnique: vi.fn(async () => ({
          executionCycle: { status: 'RUNNING', journey: { id: 'journey', status: journeyStatus, version: 1 } },
        })),
      },
      qualityJourney: { updateMany: vi.fn(async () => ({ count: journeyStatus === 'ACTIVE' ? 1 : 0 })) },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(client)),
    }
    const service = new RuntimeCapsuleTestRunService(client as never)
    const scheduling = service['scheduleReservedCapsule']({
      testRun: {
        id: 'run-db',
        runId: 'run-public',
        targetProjectId: 'target',
        environmentId: 'environment',
        intent: 'QUALITY_JOURNEY',
        status: TestRunStatus.RUNNING,
        environment: { id: 'environment' } as never,
        targetProject: { kind: 'LOCAL_WORKSPACE' },
      },
      materialized: {
        row: { id: 'capsule', validationHash: 'hash' },
        manifest: { commandReceipt: { hash: 'receipt' } },
      },
      paths: { capsuleRoot: '/tmp/capsule' } as never,
      attempt: { id: 'attempt', ownerToken: 'owner', version: 2 },
      remoteScopeRequired: false,
      label: 'Journey',
      beforeSpawnError: 'before spawn',
      verifyRunStatusAfterSpawn: true,
    })
    await vi.waitFor(() => expect(executeCapsule).toHaveBeenCalledTimes(1))
    journeyStatus = 'PAUSED'
    runStatus = TestRunStatus.CANCELLING
    releaseSpawn({ process: { name: 'capsule', pid: 34567 }, reportPath: '/tmp/report' })
    await expect(scheduling).rejects.toThrow('paused or cancelling')
    expect(stopOwned).toHaveBeenCalledTimes(1)
    expect(runStatus).toBe(TestRunStatus.CANCELLING)
    expect(attemptState).toBe('CANCELLED')
    expect(JSON.parse(stopReceiptJson!)).toMatchObject({ kind: 'group_exit_observed', groupId: 34567 })
  })

  it('releases local ownership and projects terminal state once when the receipt arrives after output', async () => {
    let runStatus: TestRunStatus = TestRunStatus.RUNNING
    let runResult = 'PENDING'
    let attemptState = 'STARTING'
    let stopReceiptJson: string | null = null
    let stopReceiptHash: string | null = null
    let outputCompletedAt: Date | null = null
    const onTerminal = vi.fn(async () => undefined)
    executeCapsule.mockResolvedValueOnce({ process: { name: 'capsule', pid: 34567 }, reportPath: '/tmp/report' })
    scheduleCompletion.mockImplementationOnce(
      async ({
        launch,
        onTerminal: completed,
      }: {
        launch: () => Promise<unknown>
        onTerminal: () => Promise<void>
      }) => {
        await launch()
        runStatus = TestRunStatus.CANCELLING
        outputCompletedAt = new Date()
        await completed()
      },
    )
    const run = () => ({
      id: 'run-db',
      runId: 'run-public',
      status: runStatus,
      result: runResult,
      logPath: '/tmp/capsule/logs/cucumber.log',
      runtimeCapsuleExecutionAttempt: {
        id: 'attempt',
        state: attemptState,
        stopReceiptJson,
        stopReceiptHash,
        outputCompletedAt,
      },
    })
    const client = {
      testRun: {
        update: vi.fn(async () => undefined),
        findUniqueOrThrow: vi.fn(async () => run()),
        findUnique: vi.fn(async () => run()),
        updateMany: vi.fn(async ({ data }: { data: { status: TestRunStatus; result?: string } }) => {
          runStatus = data.status
          if (data.result) runResult = data.result
          return { count: 1 }
        }),
      },
      runtimeCapsuleExecutionAttempt: {
        findUniqueOrThrow: vi.fn(async () => ({ state: attemptState, ownerToken: 'owner' })),
        updateMany: vi.fn(
          async ({ data }: { data: { state?: string; stopReceiptJson?: string; stopReceiptHash?: string } }) => {
            if (data.state) attemptState = data.state
            if (data.stopReceiptJson) stopReceiptJson = data.stopReceiptJson
            if (data.stopReceiptHash) stopReceiptHash = data.stopReceiptHash
            return { count: 1 }
          },
        ),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(client)),
    }
    const service = new RuntimeCapsuleTestRunService(client as never)
    await service['scheduleReservedCapsule']({
      testRun: {
        id: 'run-db',
        runId: 'run-public',
        targetProjectId: 'target',
        environmentId: 'environment',
        intent: 'INDEPENDENT',
        status: TestRunStatus.RUNNING,
        environment: { id: 'environment' } as never,
        targetProject: { kind: 'LOCAL_WORKSPACE' },
      },
      materialized: {
        row: { id: 'capsule', validationHash: 'hash' },
        manifest: { commandReceipt: { hash: 'receipt' } },
      },
      paths: { capsuleRoot: '/tmp/capsule' } as never,
      attempt: { id: 'attempt', ownerToken: 'owner', version: 2 },
      remoteScopeRequired: false,
      label: 'Independent',
      beforeSpawnError: 'before spawn',
      verifyRunStatusAfterSpawn: true,
      onTerminal,
    })
    expect(onTerminal).not.toHaveBeenCalled()
    expect(releaseCapsule).not.toHaveBeenCalled()
    await persistObservedCapsuleStop(client as never, {
      testRunId: 'run-db',
      runId: 'run-public',
      attemptId: 'attempt',
      ownerToken: 'owner',
      observation: {
        kind: 'group_exit_observed',
        groupId: 34567,
        observedAt: new Date().toISOString(),
        supervisorProtocol: 'appraise.owned-supervisor/v1',
        runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
      },
    })
    expect(runStatus).toBe(TestRunStatus.CANCELLED)
    expect(releaseCapsule).toHaveBeenCalledOnce()
    expect(onTerminal).toHaveBeenCalledOnce()
  })
})
