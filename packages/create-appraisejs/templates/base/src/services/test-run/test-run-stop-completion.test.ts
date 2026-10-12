import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { TestRunResult, TestRunStatus } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OwnedProcessStopError } from '@/lib/process/owned-process-stop'
import { hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import {
  markCapsuleOutputCompleted,
  persistObservedCapsuleStop,
  reconcileCancelledCapsuleTestRun,
} from './runtime-capsule-stop-service'

vi.mock('@/services/test-run/run-evidence-summary-service', () => ({
  persistRunEvidenceHealth: vi.fn(async () => ({ evidenceHealth: 'invalid_missing_report' })),
  summarizeRunEvidence: vi.fn(),
}))
vi.mock('@/lib/test-run/winston-logger', () => ({
  closeLogger: vi.fn(async () => undefined),
  createTestRunLogger: vi.fn(),
}))

import { scheduleTestRunCompletion } from './test-run-service'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

function exactReceipt() {
  return {
    schema: 'appraise.runtime-capsule-stop/local-v1',
    testRunId: 'run-db',
    runId: 'run-public',
    attemptId: 'attempt',
    kind: 'group_exit_observed',
    groupId: 34567,
    supervisorProtocol: 'appraise.owned-supervisor/v1',
    runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
    observedAt: '2026-10-02T00:00:00.000Z',
  }
}

async function fixture(receipt: Record<string, unknown> | null, receiptHash?: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-stop-completion-'))
  directories.push(directory)
  let status: TestRunStatus = TestRunStatus.CANCELLING
  let result: TestRunResult = TestRunResult.PENDING
  let attemptState = receipt ? 'CANCELLED' : 'RUNNING'
  let outputCompletedAt: Date | null = null
  const attempt = {
    id: 'attempt',
    state: attemptState,
    stopReceiptJson: receipt ? JSON.stringify(receipt) : null,
    stopReceiptHash: receiptHash ?? (receipt ? hashRuntimeCapsuleValue(receipt) : null),
    outputCompletedAt,
  }
  const run = () => ({
    id: 'run-db',
    runId: 'run-public',
    status,
    result,
    logPath: path.join(directory, 'run.log'),
    reportPath: null,
    runtimeCapsule: { id: 'capsule' },
    runtimeCapsuleExecutionAttempt: { ...attempt, state: attemptState, outputCompletedAt },
  })
  const client = {
    testRun: {
      update: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => run()),
      findUniqueOrThrow: vi.fn(async () => run()),
      updateMany: vi.fn(async ({ data }: { data: { status: TestRunStatus; result: TestRunResult } }) => {
        status = data.status
        result = data.result
        return { count: 1 }
      }),
    },
    runtimeCapsuleExecutionAttempt: {
      findUnique: vi.fn(async () => ({ ...attempt, state: attemptState, outputCompletedAt })),
      updateMany: vi.fn(
        async ({
          data,
        }: {
          data: { state?: string; outputCompletedAt?: Date; stopReceiptJson?: string; stopReceiptHash?: string }
        }) => {
          if (data.state) attemptState = data.state
          if (data.outputCompletedAt) outputCompletedAt = data.outputCompletedAt
          if (data.stopReceiptJson) attempt.stopReceiptJson = data.stopReceiptJson
          if (data.stopReceiptHash) attempt.stopReceiptHash = data.stopReceiptHash
          return { count: 1 }
        },
      ),
    },
    testRunLog: { upsert: vi.fn(async () => undefined) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(client)),
  }
  const onTerminal = vi.fn(async () => undefined)
  const process = {
    name: 'owned-capsule',
    output: { stdout: ['final output\n'], stderr: [] },
    startTime: new Date(),
    endTime: new Date(),
  }
  const args = {
    testRun: { id: 'run-db', runId: 'run-public' },
    environment: { passwordEnvironmentVariable: null } as never,
    logger: { info: vi.fn(), error: vi.fn() } as never,
    launch: vi.fn(async () => ({ process, reportPath: path.join(directory, 'report.json') })) as never,
    executionAttempt: { id: 'attempt', ownerToken: 'owner' },
    client: client as never,
    onTerminal,
  }
  return {
    client,
    args,
    onTerminal,
    current: () => ({ status, result, attemptState }),
    logPath: path.join(directory, 'run.log'),
  }
}

describe('managed cancellation completion receipt gate', () => {
  it('keeps CANCELLING when the stored receipt has another run identity', async () => {
    const receipt = { ...exactReceipt(), runId: 'another-run' }
    const { client, args, onTerminal, current, logPath } = await fixture(receipt)
    await scheduleTestRunCompletion({ ...args, waitForProcess: vi.fn(async () => 0) })
    await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledOnce())
    expect(await fs.readFile(logPath, 'utf8')).toContain('final output')
    expect(client.testRun.updateMany).not.toHaveBeenCalled()
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLING, result: TestRunResult.PENDING })
  })

  it.each([
    ['tampered hash', exactReceipt(), 'sha256:invalid'],
    ['missing observed group', { ...exactReceipt(), groupId: undefined }, undefined],
    ['unknown supervisor protocol', { ...exactReceipt(), supervisorProtocol: 'unknown' }, undefined],
    ['missing browser closure', { ...exactReceipt(), runtimeBrowserCleanup: 'NOT_REQUIRED' }, undefined],
  ])('keeps CANCELLING for a %s receipt', async (_label, receipt, hash) => {
    const { client, args, onTerminal, current } = await fixture(receipt, hash)
    await scheduleTestRunCompletion({ ...args, waitForProcess: vi.fn(async () => 0) })
    await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledOnce())
    expect(client.testRun.updateMany).not.toHaveBeenCalled()
    expect(current().status).toBe(TestRunStatus.CANCELLING)
  })

  it('waits for owned exit and final output before committing an exact receipt', async () => {
    const { client, args, onTerminal, current, logPath } = await fixture(exactReceipt())
    let releaseExit!: (code: number) => void
    const waitForProcess = vi.fn(() => new Promise<number>(resolve => (releaseExit = resolve)))
    await scheduleTestRunCompletion({ ...args, waitForProcess })
    expect(current().status).toBe(TestRunStatus.CANCELLING)
    expect(client.testRun.updateMany).not.toHaveBeenCalled()
    releaseExit(0)
    await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledOnce())
    expect(await fs.readFile(logPath, 'utf8')).toContain('final output')
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED })
  })

  it('leaves the run nonterminal when owned exit is unverified', async () => {
    const { client, args, onTerminal, current } = await fixture(null)
    await scheduleTestRunCompletion({
      ...args,
      waitForProcess: vi.fn(async () => {
        throw new OwnedProcessStopError('exit_unverified', 'group still live')
      }),
    })
    await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledOnce())
    expect(client.testRun.updateMany).not.toHaveBeenCalled()
    expect(client.testRunLog.upsert).not.toHaveBeenCalled()
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLING, result: TestRunResult.PENDING })
  })

  it('refuses to persist a generic group stop without managed browser closure proof', async () => {
    const { client, current } = await fixture(null)
    await expect(
      persistObservedCapsuleStop(client as never, {
        testRunId: 'run-db',
        runId: 'run-public',
        attemptId: 'attempt',
        ownerToken: 'owner',
        observation: {
          kind: 'group_exit_observed',
          groupId: 34567,
          observedAt: new Date().toISOString(),
          supervisorProtocol: 'appraise.owned-supervisor/v1',
          runtimeBrowserCleanup: 'NOT_REQUIRED',
        },
      }),
    ).rejects.toThrow('browser closure proof')
    expect(client.runtimeCapsuleExecutionAttempt.updateMany).not.toHaveBeenCalled()
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLING, attemptState: 'RUNNING' })
  })

  it('finalizes once when the stop receipt arrives more than ten minutes after durable output', async () => {
    const { client, current } = await fixture(null)
    await markCapsuleOutputCompleted(client as never, {
      testRunId: 'run-db',
      attemptId: 'attempt',
      ownerToken: 'owner',
    })
    expect(current().status).toBe(TestRunStatus.CANCELLING)
    await persistObservedCapsuleStop(client as never, {
      testRunId: 'run-db',
      runId: 'run-public',
      attemptId: 'attempt',
      ownerToken: 'owner',
      observation: {
        kind: 'group_exit_observed',
        groupId: 34567,
        supervisorProtocol: 'appraise.owned-supervisor/v1',
        runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
        observedAt: new Date(Date.now() + 11 * 60_000).toISOString(),
      },
    })
    expect(current()).toMatchObject({ status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED })
    expect(client.testRun.updateMany).toHaveBeenCalledTimes(1)
    await reconcileCancelledCapsuleTestRun(client as never, 'run-db')
    expect(client.testRun.updateMany).toHaveBeenCalledTimes(1)
  })
})
