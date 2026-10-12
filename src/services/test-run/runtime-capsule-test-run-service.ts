import crypto from 'node:crypto'
import path from 'node:path'
import { TestRunResult, TestRunStatus, type Environment, type Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { restoreJourneyExecutionEnvironment } from '@/lib/quality-journey/execution-environment'
import {
  frozenEnvironmentSnapshot,
  runtimeEnvironmentFromFrozenPacket,
} from '@/lib/runtime-capsule/frozen-environment-snapshot'
import { CapsuleExecutorAdapter } from '@/lib/executor/capsule-executor-adapter'
import { OwnedProcessStopError, stopOwnedProcessGroup } from '@/lib/process/owned-process-stop'
import { formatLogsForStorage } from '@/lib/test-run/log-formatter'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import { RuntimeCapsuleMaterializer, RuntimeCapsulePreflight, resolveRuntimeCapsulePaths } from '@/lib/runtime-capsule'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import {
  cancelRuntimeCapsuleTestRun,
  persistObservedCapsuleStop,
  reconcileCancelledCapsuleTestRun,
  registerCapsuleTerminalCallback,
} from './runtime-capsule-stop-service'
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
type ScheduledCapsule = {
  testRun: CapsuleStartTestRun
  materialized: CapsuleMaterialization
  paths: ReturnType<typeof resolveRuntimeCapsulePaths>
  attempt: OwnedAttempt
  remoteScopeRequired: boolean
  label: 'Journey' | 'Independent'
  beforeSpawnError: string
  verifyRunStatusAfterSpawn: boolean
  onTerminal?: () => Promise<void>
}

function isTerminalRunStatus(status: TestRunStatus | undefined): boolean {
  return status === TestRunStatus.CANCELLED || status === TestRunStatus.COMPLETED
}

function hasCollectedCancellation(
  status: TestRunStatus | undefined,
  outputCompletedAt: Date | null | undefined,
): boolean {
  return status === TestRunStatus.CANCELLING && Boolean(outputCompletedAt)
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

  private async assertJourneyLaunchAdmitted(tx: Prisma.TransactionClient, testRunId: string): Promise<void> {
    const binding = await tx.qualityJourneyExecutionTestRun.findUnique({
      where: { testRunId },
      select: {
        executionCycle: {
          select: { status: true, journey: { select: { id: true, status: true, version: true } } },
        },
      },
    })
    const cycle = binding?.executionCycle
    const journey = cycle?.journey
    if (!cycle || !journey || journey.status !== 'ACTIVE' || !['RESERVED', 'RUNNING'].includes(cycle.status))
      throw new Error('Journey execution is paused or cancelling; capsule launch is not admitted.')
    const fenced = await tx.qualityJourney.updateMany({
      where: { id: journey.id, status: 'ACTIVE', version: journey.version },
      data: { updatedAt: new Date() },
    })
    if (fenced.count !== 1) throw new Error('Journey pause fence changed before capsule launch.')
  }

  private async reserveCapsuleAttempt(input: {
    testRun: CapsuleStartTestRun
    intent: CapsuleIntent
    materialized: CapsuleMaterialization
    preflight: unknown
  }) {
    const ownerToken = crypto.randomUUID()
    const attempt = await this.client.$transaction(async tx => {
      if (input.intent === 'QUALITY_JOURNEY') await this.assertJourneyLaunchAdmitted(tx, input.testRun.id)
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

  private async scheduleReservedCapsule(input: ScheduledCapsule) {
    const logPath = path.join(input.paths.capsuleRoot, 'logs/cucumber.log')
    const logger = await createTestRunLogger(input.testRun.runId, logPath)
    await this.client.testRun.update({ where: { id: input.testRun.id }, data: { logPath } })
    const adapter = new CapsuleExecutorAdapter(this.client, this.appraiseRoot)
    let launchedProcessName: string | undefined
    let terminalNotified = false
    const finishIfTerminal = async () => {
      const current = await this.client.testRun.findUnique({
        where: { id: input.testRun.id },
        select: {
          status: true,
          runtimeCapsuleExecutionAttempt: { select: { outputCompletedAt: true } },
        },
      })
      if (isTerminalRunStatus(current?.status)) {
        if (terminalNotified) return
        terminalNotified = true
        if (launchedProcessName) adapter.releaseTerminalProcess(input.testRun.runId, launchedProcessName)
        await input.onTerminal?.()
        return
      }
      if (hasCollectedCancellation(current?.status, current?.runtimeCapsuleExecutionAttempt?.outputCompletedAt)) {
        registerCapsuleTerminalCallback(input.testRun.id, finishIfTerminal)
        await reconcileCancelledCapsuleTestRun(this.client, input.testRun.id)
      }
    }
    try {
      await scheduleTestRunCompletion({
        testRun: input.testRun,
        environment: frozenEnvironment(input.testRun, input.remoteScopeRequired),
        logger,
        launch: async () => {
          await this.assertReadyBeforeSpawn(input)
          let launched: Awaited<ReturnType<typeof adapter.execute>>
          try {
            launched = await adapter.execute({
              projectId: input.testRun.targetProjectId,
              validationHash: input.materialized.row.validationHash,
              testRunId: input.testRun.id,
              runId: input.testRun.runId,
              capsuleRoot: input.paths.capsuleRoot,
              receiptHash: input.materialized.manifest.commandReceipt.hash,
            })
          } catch (error) {
            if (error instanceof OwnedProcessStopError)
              await this.client.testRun.updateMany({
                where: { id: input.testRun.id, status: TestRunStatus.RUNNING },
                data: { status: TestRunStatus.CANCELLING },
              })
            throw error
          }
          launchedProcessName = launched.process.name
          await this.transitionOrStopAfterSpawn(input, launched)
          return launched
        },
        executionAttempt: { id: input.attempt.id, ownerToken: input.attempt.ownerToken },
        onTerminal: finishIfTerminal,
        client: this.client,
        waitForProcess: processName => adapter.waitForProcess(processName),
        appraiseRoot: this.appraiseRoot,
      })
    } catch (error) {
      // The completion scheduler's synchronous failure path does not invoke onTerminal.
      await finishIfTerminal()
      throw error
    }
  }

  private async assertReadyBeforeSpawn(input: ScheduledCapsule): Promise<void> {
    const current = await this.client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({
      where: { id: input.attempt.id },
    })
    if (current.state !== 'STARTING' || current.ownerToken !== input.attempt.ownerToken)
      throw new Error(input.beforeSpawnError)
    let beforeSpawn: { status: TestRunStatus }
    try {
      beforeSpawn = await this.client.$transaction(async tx => {
        const run = await tx.testRun.findUniqueOrThrow({
          where: { id: input.testRun.id },
          select: { status: true },
        })
        if (run.status === TestRunStatus.RUNNING && input.testRun.intent === 'QUALITY_JOURNEY')
          await this.assertJourneyLaunchAdmitted(tx, input.testRun.id)
        return run
      })
    } catch (error) {
      if (input.testRun.intent !== 'QUALITY_JOURNEY') throw error
      await this.client.testRun.updateMany({
        where: { id: input.testRun.id, status: TestRunStatus.RUNNING },
        data: { status: TestRunStatus.CANCELLING },
      })
      await this.persistNeverStarted(input)
      throw error
    }
    if (beforeSpawn.status === TestRunStatus.CANCELLING) {
      await this.persistNeverStarted(input)
      throw new Error(input.beforeSpawnError)
    }
    if (beforeSpawn.status !== TestRunStatus.RUNNING) throw new Error(input.beforeSpawnError)
  }

  private async persistNeverStarted(input: ScheduledCapsule): Promise<void> {
    await persistObservedCapsuleStop(this.client, {
      testRunId: input.testRun.id,
      runId: input.testRun.runId,
      attemptId: input.attempt.id,
      ownerToken: input.attempt.ownerToken,
      observation: { kind: 'never_started', observedAt: new Date().toISOString() },
    })
  }

  private async transitionOrStopAfterSpawn(
    input: ScheduledCapsule,
    launched: Awaited<ReturnType<CapsuleExecutorAdapter['execute']>>,
  ): Promise<void> {
    let transitioned = false
    let transitionError: unknown
    try {
      transitioned = await this.transitionAttemptToRunning({
        attempt: input.attempt,
        testRunId: input.testRun.id,
        verifyRunStatus: input.verifyRunStatusAfterSpawn,
        journey: input.testRun.intent === 'QUALITY_JOURNEY',
      })
    } catch (error) {
      transitionError = error
    }
    if (transitioned) return
    await this.client.testRun.updateMany({
      where: { id: input.testRun.id, status: TestRunStatus.RUNNING },
      data: { status: TestRunStatus.CANCELLING },
    })
    const observation = await stopOwnedProcessGroup(launched.process)
    await persistObservedCapsuleStop(this.client, {
      testRunId: input.testRun.id,
      runId: input.testRun.runId,
      attemptId: input.attempt.id,
      ownerToken: input.attempt.ownerToken,
      observation,
    })
    throw transitionError ?? new Error(`${input.label} capsule execution ownership changed during spawn registration.`)
  }

  private async transitionAttemptToRunning(input: {
    attempt: OwnedAttempt
    testRunId: string
    verifyRunStatus: boolean
    journey: boolean
  }) {
    if (!input.verifyRunStatus) {
      const running = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: input.attempt.id, state: 'STARTING', ownerToken: input.attempt.ownerToken },
        data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      })
      return running.count === 1
    }
    return this.client.$transaction(async tx => {
      if (input.journey) await this.assertJourneyLaunchAdmitted(tx, input.testRunId)
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
    // A failed stop observation is an unresolved owned launch, not a terminal start failure.
    if (input.error instanceof OwnedProcessStopError) return
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
      throw new Error(
        journey
          ? 'Journey TestRun has an invalid execution intent.'
          : 'Independent TestRun has an invalid execution intent.',
      )
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

  async cancel(testRunId: string, executionCycleId?: string) {
    return cancelRuntimeCapsuleTestRun(this.client, testRunId, executionCycleId)
  }
}
