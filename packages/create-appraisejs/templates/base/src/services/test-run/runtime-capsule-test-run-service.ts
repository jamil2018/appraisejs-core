import crypto from 'node:crypto'
import path from 'node:path'
import { TestRunResult, TestRunStatus, type Environment, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { restoreJourneyExecutionEnvironment } from '@/lib/quality-journey/execution-environment'
import {
  frozenEnvironmentSnapshot,
  runtimeEnvironmentFromFrozenPacket,
} from '@/lib/runtime-capsule/frozen-environment-snapshot'
import { CapsuleExecutorAdapter } from '@/lib/executor/capsule-executor-adapter'
import { formatLogsForStorage } from '@/lib/test-run/log-formatter'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import {
  RuntimeCapsuleMaterializer,
  RuntimeCapsulePreflight,
  resolveRuntimeCapsulePaths,
} from '@/lib/runtime-capsule'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { scheduleTestRunCompletion } from './test-run-service'

type CapsuleIntent = 'INDEPENDENT' | 'QUALITY_JOURNEY'
type CapsuleMaterialization = {
  row: { id: string; validationHash: string }
  manifest: { commandReceipt: { hash: string } }
}
type OwnedAttempt = { id: string; ownerToken: string; version: number }
type CapsuleStartTestRun = {
  id: string
  runId: string
  targetProjectId: string
  environmentId: string
  intent: string
  status: TestRunStatus
  environment: Environment
  environmentSnapshotJson?: string | null
  environmentSnapshotHash?: string | null
  environmentSnapshotVersion?: number | null
  targetProject: { kind: string }
  runtimeCapsuleExecutionAttempt?: {
    id: string
    state: string
    ownerToken: string | null
    version: number
  } | null
}

function assertCapsulePreflightReady(preflight: { status: string; blockers: Array<{ code: string }> }) {
  if (preflight.status !== 'ready') throw new Error(`Capsule preflight blocked: ${preflight.blockers[0]?.code}`)
}

function frozenEnvironment<
  T extends {
    environment: Environment
    environmentSnapshotJson?: string | null
    environmentSnapshotHash?: string | null
    environmentSnapshotVersion?: number | null
  },
>(testRun: T, remoteScopeRequired = false): Environment {
  if (testRun.environmentSnapshotJson?.includes('appraise.quality-journey-execution-environment/local-v1'))
    return restoreJourneyExecutionEnvironment(testRun)
  const packet = frozenEnvironmentSnapshot(testRun, { required: remoteScopeRequired })
  return (
    packet ? runtimeEnvironmentFromFrozenPacket(testRun.environment as never, packet) : testRun.environment
  ) as Environment
}

export class RuntimeCapsuleTestRunService {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
  ) {}

  private async reserveCapsuleAttempt(input: {
    testRun: CapsuleStartTestRun
    intent: CapsuleIntent
    materialized: CapsuleMaterialization
    preflight: unknown
  }) {
    const ownerToken = crypto.randomUUID()
    const attempt = await this.client.$transaction(async tx => {
      const claimedRun = await tx.testRun.updateMany({
        where: { id: input.testRun.id, status: TestRunStatus.QUEUED, intent: input.intent },
        data: { status: TestRunStatus.RUNNING },
      })
      if (claimedRun.count !== 1)
        throw new Error(
          `${input.intent === 'QUALITY_JOURNEY' ? 'Quality Journey TestRun' : 'Independent TestRun'} was cancelled before execution claim.`,
        )
      return tx.runtimeCapsuleExecutionAttempt.upsert({
        where: { testRunId: input.testRun.id },
        update: {},
        create: {
          testRunId: input.testRun.id,
          capsuleId: input.materialized.row.id,
          receiptHash: input.materialized.manifest.commandReceipt.hash,
          preflightResultJson: canonicalRuntimeCapsuleJson(input.preflight),
          preflightResultHash: hashRuntimeCapsuleValue(input.preflight),
          preflightCheckedAt: new Date((input.preflight as { checkedAt: string }).checkedAt),
          state: 'STARTING',
          ownerToken,
        },
      })
    })
    return { attempt, ownerToken }
  }

  private async claimAttemptStart(attempt: OwnedAttempt, errorMessage: string) {
    const claimed = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
      where: { id: attempt.id, state: 'STARTING', ownerToken: attempt.ownerToken, version: attempt.version },
      data: { version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new Error(errorMessage)
    return { ...attempt, version: attempt.version + 1 }
  }

  private async scheduleReservedCapsule(input: {
    testRun: CapsuleStartTestRun
    materialized: CapsuleMaterialization
    paths: ReturnType<typeof resolveRuntimeCapsulePaths>
    attempt: OwnedAttempt
    remoteScopeRequired: boolean
    label: 'Journey' | 'Independent'
    beforeSpawnError: string
    verifyRunStatusAfterSpawn: boolean
    onTerminal?: () => Promise<void>
  }) {
    const logPath = path.join(input.paths.capsuleRoot, 'logs/cucumber.log')
    const logger = await createTestRunLogger(input.testRun.runId, logPath)
    await this.client.testRun.update({ where: { id: input.testRun.id }, data: { logPath } })
    const adapter = new CapsuleExecutorAdapter(this.client, this.appraiseRoot)
    await scheduleTestRunCompletion({
      testRun: input.testRun,
      environment: frozenEnvironment(input.testRun, input.remoteScopeRequired),
      logger,
      launch: async () => {
        const current = await this.client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({
          where: { id: input.attempt.id },
        })
        if (current.state !== 'STARTING' || current.ownerToken !== input.attempt.ownerToken)
          throw new Error(input.beforeSpawnError)
        const launched = await adapter.execute({
          projectId: input.testRun.targetProjectId,
          validationHash: input.materialized.row.validationHash,
          testRunId: input.testRun.id,
          runId: input.testRun.runId,
          capsuleRoot: input.paths.capsuleRoot,
          receiptHash: input.materialized.manifest.commandReceipt.hash,
        })
        const transitioned = await this.transitionAttemptToRunning({
          attempt: input.attempt,
          testRunId: input.testRun.id,
          verifyRunStatus: input.verifyRunStatusAfterSpawn,
        })
        if (!transitioned) {
          launched.process.process.kill('SIGTERM')
          throw new Error(`${input.label} capsule execution ownership changed during spawn registration.`)
        }
        return launched
      },
      executionAttempt: { id: input.attempt.id, ownerToken: input.attempt.ownerToken },
      onTerminal: input.onTerminal,
      client: this.client,
      waitForProcess: processName => adapter.waitForProcess(processName),
      appraiseRoot: this.appraiseRoot,
    })
  }

  private async transitionAttemptToRunning(input: {
    attempt: OwnedAttempt
    testRunId: string
    verifyRunStatus: boolean
  }) {
    if (!input.verifyRunStatus) {
      const running = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: input.attempt.id, state: 'STARTING', ownerToken: input.attempt.ownerToken },
        data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      })
      return running.count === 1
    }
    return this.client.$transaction(async tx => {
      const running = await tx.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: input.attempt.id, state: 'STARTING', ownerToken: input.attempt.ownerToken },
        data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      })
      if (running.count !== 1) return false
      const run = await tx.testRun.findUnique({ where: { id: input.testRunId }, select: { status: true } })
      if (run?.status !== TestRunStatus.RUNNING)
        throw new Error('Quality TestRun was cancelled before spawn registration.')
      return true
    })
  }

  private async failCapsuleStart(input: {
    testRun: CapsuleStartTestRun
    intent: CapsuleIntent
    ownedAttempt?: OwnedAttempt
    failedComponent: string
    error: unknown
  }) {
    const completedAt = new Date()
    const message = (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500)
    if (input.ownedAttempt) {
      await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: {
          id: input.ownedAttempt.id,
          ownerToken: input.ownedAttempt.ownerToken,
          state: 'STARTING',
          version: input.ownedAttempt.version,
        },
        data: { state: 'FAILED', completedAt, failure: message, version: { increment: 1 } },
      })
    }
    await this.client.testRun.updateMany({
      where: {
        id: input.testRun.id,
        ...(input.intent === 'INDEPENDENT' ? { intent: 'INDEPENDENT' } : {}),
        status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] },
      },
      data: {
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.FAILED,
        evidenceHealth: 'infrastructure_failure',
        completedAt,
      },
    })
    const label = input.intent === 'QUALITY_JOURNEY' ? 'Journey' : 'independent'
    const logs = formatLogsForStorage([
      {
        type: 'stderr',
        message: `Infrastructure failure in ${label} runtime capsule ${input.failedComponent}: ${message}`,
        timestamp: completedAt,
      },
    ])
    await this.client.testRunLog.upsert({
      where: { testRunId: input.testRun.runId },
      create: { testRunId: input.testRun.runId, logs },
      update: { logs },
    })
  }

  async startIndependentAuthored(input: { testRunDbId: string }) {
    return this.startSelectedCapsule(input, false)
  }

  async startJourneyPrepared(input: { testRunDbId: string; onTerminal?: () => Promise<void> }) {
    return this.startSelectedCapsule(input, true)
  }

  private async selectedCapsuleContext(input: { testRunDbId: string }, journey: boolean) {
    const persisted = await this.client.testRun.findUniqueOrThrow({
      where: { id: input.testRunDbId },
      include: {
        qualityJourneyExecutionBinding: true,
        environment: true,
        targetProject: { select: { kind: true } },
        testCases: true,
        runtimeCapsuleExecutionAttempt: { include: { capsule: true } },
      },
    })
    if (Boolean(persisted.qualityJourneyExecutionBinding) !== journey)
      throw new Error('Journey-owned TestRuns require the specialized frozen execution boundary.')
    const expectedIntent = journey ? 'QUALITY_JOURNEY' : 'INDEPENDENT'
    if (persisted.intent !== expectedIntent)
      throw new Error(journey ? 'Journey TestRun has an invalid execution intent.' : 'Independent TestRun has an invalid execution intent.')
    const testRun = journey ? { ...persisted, environment: restoreJourneyExecutionEnvironment(persisted) } : persisted
    if (testRun.status !== TestRunStatus.QUEUED)
      throw new Error('Independent TestRun is no longer queued for capsule execution.')
    const remoteScopeRequired = testRun.targetProject.kind === 'REMOTE_BLACK_BOX'
    // Independent authored snapshots have no Journey owner, but a remote target still
    // must never inherit mutable Environment configuration at materialization
    // or execution time.
    if (!journey) frozenEnvironmentSnapshot(testRun, { required: remoteScopeRequired })
    return { testRun, remoteScopeRequired }
  }

  private async startSelectedCapsule(
    input: { testRunDbId: string; onTerminal?: () => Promise<void> },
    journey: boolean,
  ) {
    let ownedAttempt: OwnedAttempt | undefined
    let failedComponent = 'materialization'
    const { testRun, remoteScopeRequired } = await this.selectedCapsuleContext(input, journey)
    const existing = testRun.runtimeCapsuleExecutionAttempt
    if (existing) return { testRunId: testRun.id, runId: testRun.runId, attemptId: existing.id, state: existing.state }
    try {
      const materializer = new RuntimeCapsuleMaterializer(this.client, this.appraiseRoot)
      const materialized: CapsuleMaterialization = journey
        ? await materializer.materializeJourneyPrepared({ testRunId: testRun.id })
        : await materializer.materializeAuthored({ testRunId: testRun.id })
      const paths = resolveRuntimeCapsulePaths({
        appraiseRoot: this.appraiseRoot,
        projectId: testRun.targetProjectId,
        validationHash: materialized.row.validationHash,
        runId: testRun.runId,
      })
      failedComponent = 'preflight'
      const preflight = await new RuntimeCapsulePreflight(this.client, this.appraiseRoot).check({
        projectId: testRun.targetProjectId,
        validationHash: materialized.row.validationHash,
        testRunId: testRun.id,
        runId: testRun.runId,
      })
      const { attempt, ownerToken } = await this.reserveCapsuleAttempt({
        testRun,
        intent: journey ? 'QUALITY_JOURNEY' : 'INDEPENDENT',
        materialized,
        preflight,
      })
      if (attempt.ownerToken !== ownerToken)
        return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, state: attempt.state }
      ownedAttempt = { id: attempt.id, ownerToken, version: attempt.version }
      assertCapsulePreflightReady(preflight)
      ownedAttempt = await this.claimAttemptStart(
        ownedAttempt,
        'Independent capsule execution ownership changed before spawn.',
      )
      await this.scheduleReservedCapsule({
        testRun,
        materialized,
        paths,
        attempt: ownedAttempt,
        remoteScopeRequired,
        label: 'Independent',
        beforeSpawnError: 'Independent capsule execution was cancelled before spawn.',
        verifyRunStatusAfterSpawn: true,
        onTerminal: input.onTerminal,
      })
      return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, preflight }
    } catch (error) {
      await this.failCapsuleStart({
        testRun,
        intent: journey ? 'QUALITY_JOURNEY' : 'INDEPENDENT',
        ownedAttempt,
        failedComponent,
        error,
      })
      throw error
    }
  }

  private async activeAttemptContext(testRunId: string) {
    const attempt = await this.client.runtimeCapsuleExecutionAttempt.findUnique({ where: { testRunId } })
    if (!attempt || !['STARTING', 'RUNNING'].includes(attempt.state)) return null
    const run = await this.client.testRun.findUniqueOrThrow({
      where: { id: testRunId },
      select: { runId: true, qualityJourneyExecutionBinding: { select: { id: true } } },
    })
    return { attempt, run }
  }

  async cancel(testRunId: string, executionCycleId?: string) {
    const cancellationRun = await this.client.testRun.findUniqueOrThrow({
      where: { id: testRunId },
      include: { qualityJourneyExecutionBinding: true },
    })
    const binding = cancellationRun.qualityJourneyExecutionBinding
    if (binding ? binding.executionCycleId !== executionCycleId : Boolean(executionCycleId))
      throw new Error('Journey cancellation requires its exact execution cycle.')
    for (;;) {
      const context = await this.activeAttemptContext(testRunId)
      if (!context) {
        const completedAt = new Date()
        const queued = await this.client.testRun.updateMany({
          where: { id: testRunId, status: TestRunStatus.QUEUED },
          data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
        })
        return queued.count === 1
      }
      const { attempt, run } = context
      if (
        run.qualityJourneyExecutionBinding &&
        !(await import('@/lib/test-run/process-manager')).processManager.get(run.runId)
      )
        throw new Error(
          'Journey execution process ownership is unavailable; cancellation cannot prove the process stopped.',
        )
      const cancelled = await this.client.$transaction(async tx => {
        const completedAt = new Date()
        const attemptResult = await tx.runtimeCapsuleExecutionAttempt.updateMany({
          where: { id: attempt.id, state: { in: ['STARTING', 'RUNNING'] }, version: attempt.version },
          data: { state: 'CANCELLED', completedAt, version: { increment: 1 } },
        })
        if (attemptResult.count !== 1) return false
        const runResult = await tx.testRun.updateMany({
          where: { id: testRunId, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
          data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt },
        })
        if (runResult.count !== 1) throw new Error('TestRun terminal state changed before cancellation CAS.')
        return true
      })
      if (!cancelled) continue
      const process = (await import('@/lib/test-run/process-manager')).processManager.get(run.runId)
      process?.process.kill('SIGTERM')
      return true
    }
  }
}
