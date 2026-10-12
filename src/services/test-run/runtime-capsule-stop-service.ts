import { TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'

import { stopOwnedProcessGroup, type OwnedProcessStopObservation } from '@/lib/process/owned-process-stop'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { processManager } from '@/lib/test-run/process-manager'

type StopObservation = OwnedProcessStopObservation | { kind: 'never_started'; observedAt: string }
const terminalCallbacks = new Map<string, () => Promise<void>>()

export function registerCapsuleTerminalCallback(testRunId: string, callback: () => Promise<void>): void {
  terminalCallbacks.set(testRunId, callback)
}

async function notifyCapsuleTerminal(testRunId: string): Promise<void> {
  const callback = terminalCallbacks.get(testRunId)
  terminalCallbacks.delete(testRunId)
  if (!callback) return
  try {
    await callback()
  } catch (error) {
    console.error('[RuntimeCapsuleStopService] Terminal callback failed:', error)
  }
}

function validStopObservation(receipt: Record<string, unknown>): boolean {
  if (typeof receipt.observedAt !== 'string' || !Number.isFinite(Date.parse(receipt.observedAt))) return false
  if (receipt.kind === 'never_started') return receipt.groupId === undefined
  return (
    receipt.kind === 'group_exit_observed' &&
    receipt.supervisorProtocol === 'appraise.owned-supervisor/v1' &&
    receipt.runtimeBrowserCleanup === 'CLOSE_ACKNOWLEDGED' &&
    Number.isSafeInteger(receipt.groupId) &&
    Number(receipt.groupId) > 1
  )
}

function validStopReceipt(
  attempt: { id: string; stopReceiptJson: string | null; stopReceiptHash: string | null },
  testRunId: string,
  runId: string,
): boolean {
  if (!attempt.stopReceiptJson || !attempt.stopReceiptHash) return false
  try {
    const receipt = JSON.parse(attempt.stopReceiptJson) as Record<string, unknown>
    if (hashRuntimeCapsuleValue(receipt) !== attempt.stopReceiptHash) return false
    return (
      receipt.schema === 'appraise.runtime-capsule-stop/local-v1' &&
      receipt.testRunId === testRunId &&
      receipt.runId === runId &&
      receipt.attemptId === attempt.id &&
      validStopObservation(receipt)
    )
  } catch {
    return false
  }
}

function readyForCancelledTerminal(run: {
  id: string
  runId: string
  status: TestRunStatus
  result: TestRunResult
  logPath: string | null
  runtimeCapsuleExecutionAttempt: {
    id: string
    state: string
    stopReceiptJson: string | null
    stopReceiptHash: string | null
    outputCompletedAt: Date | null
  } | null
}): boolean {
  if (run.status !== TestRunStatus.CANCELLING || run.result !== TestRunResult.PENDING || !run.logPath) return false
  const attempt = run.runtimeCapsuleExecutionAttempt
  if (!attempt || attempt.state !== 'CANCELLED' || !attempt.outputCompletedAt) return false
  return validStopReceipt(attempt, run.id, run.runId)
}

/** Both receipt and completed output are durable prerequisites; either writer may arrive first. */
export async function reconcileCancelledCapsuleTestRun(client: PrismaClient, testRunId: string): Promise<boolean> {
  const terminal = await client.$transaction(async tx => {
    const run = await tx.testRun.findUnique({
      where: { id: testRunId },
      select: {
        id: true,
        runId: true,
        status: true,
        result: true,
        logPath: true,
        runtimeCapsuleExecutionAttempt: {
          select: {
            id: true,
            state: true,
            stopReceiptJson: true,
            stopReceiptHash: true,
            outputCompletedAt: true,
          },
        },
      },
    })
    if (!run) return false
    if (run.status === TestRunStatus.CANCELLED && run.result === TestRunResult.CANCELLED) return true
    if (!readyForCancelledTerminal(run)) return false
    const updated = await tx.testRun.updateMany({
      where: { id: run.id, status: TestRunStatus.CANCELLING, result: TestRunResult.PENDING },
      data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt: new Date() },
    })
    return updated.count === 1
  })
  if (terminal) await notifyCapsuleTerminal(testRunId)
  return terminal
}

export async function markCapsuleOutputCompleted(
  client: PrismaClient,
  input: { testRunId: string; attemptId: string; ownerToken: string },
): Promise<void> {
  const updated = await client.runtimeCapsuleExecutionAttempt.updateMany({
    where: {
      id: input.attemptId,
      testRunId: input.testRunId,
      ownerToken: input.ownerToken,
      state: { in: ['STARTING', 'RUNNING', 'CANCELLED'] },
      outputCompletedAt: null,
    },
    data: { outputCompletedAt: new Date(), version: { increment: 1 } },
  })
  if (updated.count !== 1) {
    const attempt = await client.runtimeCapsuleExecutionAttempt.findUnique({ where: { id: input.attemptId } })
    if (attempt?.testRunId !== input.testRunId || attempt.ownerToken !== input.ownerToken || !attempt.outputCompletedAt)
      throw new Error('Capsule output completion ownership changed before durable receipt.')
  }
  await reconcileCancelledCapsuleTestRun(client, input.testRunId)
}

export async function persistObservedCapsuleStop(
  client: PrismaClient,
  input: {
    testRunId: string
    runId: string
    attemptId: string
    ownerToken: string
    observation: StopObservation
  },
): Promise<boolean> {
  const receipt = {
    schema: 'appraise.runtime-capsule-stop/local-v1',
    testRunId: input.testRunId,
    runId: input.runId,
    attemptId: input.attemptId,
    ...input.observation,
  }
  if (!validStopObservation(receipt))
    throw new Error('Managed capsule stop observation lacks verified supervisor and browser closure proof.')
  const stopReceiptJson = canonicalRuntimeCapsuleJson(receipt)
  const stopReceiptHash = hashRuntimeCapsuleValue(receipt)
  const completedAt = new Date(input.observation.observedAt)
  const persisted = await client.$transaction(async tx => {
    const attempt = await tx.runtimeCapsuleExecutionAttempt.updateMany({
      where: {
        id: input.attemptId,
        testRunId: input.testRunId,
        ownerToken: input.ownerToken,
        state: { in: ['STARTING', 'RUNNING'] },
        stopReceiptHash: null,
      },
      data: {
        state: 'CANCELLED',
        completedAt,
        stopReceiptJson,
        stopReceiptHash,
        version: { increment: 1 },
      },
    })
    if (attempt.count !== 1) return false
    if (input.observation.kind === 'never_started') {
      const run = await tx.testRun.updateMany({
        where: { id: input.testRunId, runId: input.runId, status: TestRunStatus.CANCELLING },
        data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
      })
      if (run.count !== 1) throw new Error('TestRun cancellation state changed before stop receipt commit.')
    } else {
      const run = await tx.testRun.findUnique({ where: { id: input.testRunId }, select: { status: true } })
      if (run?.status !== TestRunStatus.CANCELLING)
        throw new Error('TestRun cancellation state changed before stop receipt commit.')
    }
    return true
  })
  if (persisted && input.observation.kind === 'group_exit_observed')
    await reconcileCancelledCapsuleTestRun(client, input.testRunId)
  return persisted
}

async function activeAttemptContext(client: PrismaClient, testRunId: string) {
  const attempt = await client.runtimeCapsuleExecutionAttempt.findUnique({ where: { testRunId } })
  if (!attempt || !['STARTING', 'RUNNING'].includes(attempt.state)) return null
  const run = await client.testRun.findUniqueOrThrow({
    where: { id: testRunId },
    select: { runId: true, qualityJourneyExecutionBinding: { select: { id: true } } },
  })
  return { attempt, run }
}

async function cancelWithoutActiveAttempt(client: PrismaClient, testRunId: string): Promise<boolean> {
  const completedAt = new Date()
  const queued = await client.testRun.updateMany({
    where: { id: testRunId, status: TestRunStatus.QUEUED },
    data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
  })
  if (queued.count === 1) return true
  await client.testRun.updateMany({
    where: { id: testRunId, status: TestRunStatus.RUNNING },
    data: { status: TestRunStatus.CANCELLING },
  })
  const current = await client.testRun.findUniqueOrThrow({ where: { id: testRunId }, select: { status: true } })
  return current.status === TestRunStatus.CANCELLED
}

async function requestActiveCancellation(
  client: PrismaClient,
  testRunId: string,
): Promise<'ready' | 'done' | 'changed'> {
  const requested = await client.testRun.updateMany({
    where: { id: testRunId, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
    data: { status: TestRunStatus.CANCELLING },
  })
  if (requested.count === 1) return 'ready'
  const current = await client.testRun.findUniqueOrThrow({ where: { id: testRunId }, select: { status: true } })
  if (current.status === TestRunStatus.CANCELLED) return 'done'
  return current.status === TestRunStatus.CANCELLING ? 'ready' : 'changed'
}

async function stopActiveAttempt(
  client: PrismaClient,
  input: { testRunId: string; runId: string; attemptId: string; ownerToken: string },
): Promise<boolean> {
  const ownedProcess = processManager.get(input.runId)
  if (!ownedProcess)
    throw new Error('Capsule process ownership is unavailable; cancellation remains pending until stop is observed.')
  const observation = await stopOwnedProcessGroup(ownedProcess)
  const committed = await persistObservedCapsuleStop(client, { ...input, observation })
  if (committed) return true
  const current = await client.testRun.findUniqueOrThrow({
    where: { id: input.testRunId },
    select: { status: true },
  })
  return current.status === TestRunStatus.CANCELLED
}

export async function cancelRuntimeCapsuleTestRun(
  client: PrismaClient,
  testRunId: string,
  executionCycleId?: string,
): Promise<boolean> {
  const cancellationRun = await client.testRun.findUniqueOrThrow({
    where: { id: testRunId },
    include: { qualityJourneyExecutionBinding: true },
  })
  const binding = cancellationRun.qualityJourneyExecutionBinding
  if (binding ? binding.executionCycleId !== executionCycleId : Boolean(executionCycleId))
    throw new Error('Journey cancellation requires its exact execution cycle.')
  if (await reconcileCancelledCapsuleTestRun(client, testRunId)) return true
  for (;;) {
    const context = await activeAttemptContext(client, testRunId)
    if (!context) return cancelWithoutActiveAttempt(client, testRunId)
    const { attempt, run } = context
    const request = await requestActiveCancellation(client, testRunId)
    if (request === 'done') return true
    if (request === 'changed') return false
    const settled = await stopActiveAttempt(client, {
      testRunId,
      runId: run.runId,
      attemptId: attempt.id,
      ownerToken: attempt.ownerToken,
    })
    if (settled) return true
  }
}
