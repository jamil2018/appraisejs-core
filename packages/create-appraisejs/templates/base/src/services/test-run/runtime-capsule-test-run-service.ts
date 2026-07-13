import crypto from 'node:crypto'
import path from 'node:path'
import { BrowserEngine, TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { CapsuleExecutorAdapter } from '@/lib/executor/capsule-executor-adapter'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import { formatLogsForStorage } from '@/lib/test-run/log-formatter'
import {
  parseCanonicalRuntimeCapsuleManifest,
  RuntimeCapsuleMaterializer,
  RuntimeCapsulePreflight,
  resolveRuntimeCapsulePaths,
} from '@/lib/runtime-capsule'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { validationArtifactSchema } from '@/lib/plan-contract'
import { scheduleTestRunCompletion } from './test-run-service'

export type PrepareCapsuleTestRunInput = {
  operationId: string
  planId: string
  validationId: string
  targetProjectId: string
  environmentId: string
  name: string
  browserEngine?: BrowserEngine
  preparationKey?: string
}

export type StartCapsuleTestRunInput = PrepareCapsuleTestRunInput & { testRunDbId: string }

function assertCapsuleStartOwnership(
  input: StartCapsuleTestRunInput,
  operation: { phase: string; planId: string; targetProjectId: string },
  testRun: { planId: string | null; targetProjectId: string | null; environmentId: string },
) {
  if (
    operation.phase !== 'review_ready' ||
    operation.planId !== input.planId ||
    operation.targetProjectId !== input.targetProjectId
  )
    throw new Error('Capsule TestRun publication ownership does not match.')
  if (
    testRun.planId !== input.planId ||
    testRun.targetProjectId !== input.targetProjectId ||
    testRun.environmentId !== input.environmentId
  )
    throw new Error('Prepared capsule TestRun ownership differs from the start request.')
}

function reuseExistingExecutionAttempt(
  input: StartCapsuleTestRunInput,
  operation: { operationHash: string },
  testRun: {
    id: string
    runId: string
    runtimeCapsuleExecutionAttempt: null | {
      id: string
      state: string
      capsule: { manifestJson: string; targetProjectId: string; testRunId: string }
    }
  },
) {
  const attempt = testRun.runtimeCapsuleExecutionAttempt
  if (!attempt) return null
  const manifest = parseCanonicalRuntimeCapsuleManifest(attempt.capsule.manifestJson)
  if (
    manifest.operationHash !== operation.operationHash ||
    attempt.capsule.targetProjectId !== input.targetProjectId ||
    attempt.capsule.testRunId !== testRun.id
  )
    throw new Error('Existing capsule execution attempt identity differs from the requested publication.')
  return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, state: attempt.state }
}

function assertCapsulePreparationOwnership(
  input: PrepareCapsuleTestRunInput,
  operation: { phase: string; planId: string; targetProjectId: string; plan: { targetProjectId: string | null } },
) {
  if (
    operation.phase !== 'review_ready' ||
    operation.planId !== input.planId ||
    operation.targetProjectId !== input.targetProjectId ||
    operation.plan.targetProjectId !== input.targetProjectId
  )
    throw new Error('Capsule TestRun publication ownership does not match.')
}

function reviewedCaseLinks(
  input: PrepareCapsuleTestRunInput,
  operation: { id: string; validationProjectionJson: string },
) {
  const validation = validationArtifactSchema.parse(JSON.parse(operation.validationProjectionJson))
  const node = validation.validations.find(item => item.id === input.validationId)
  if (!node || node.astProvenance?.schemaVersion !== '2' || node.astProvenance.publishOperationId !== operation.id)
    throw new Error('Capsule TestRun requires the exact reviewed AST validation node.')
  const suiteByCase = new Map(
    node.appraiseArtifacts.testSuites.flatMap(suite => suite.testCaseIds.map(id => [id, suite.id])),
  )
  const links = node.appraiseArtifacts.testCases.map(testCase => ({
    testCaseId: testCase.id,
    testSuiteId: suiteByCase.get(testCase.id),
  }))
  if (links.some(link => !link.testSuiteId) || links.length !== node.testCaseIds.length)
    throw new Error('Capsule TestRun expected case/suite associations are incomplete.')
  return links
}

function capsulePreparationKey(input: PrepareCapsuleTestRunInput) {
  if (input.preparationKey) return input.preparationKey
  return `sha256:${crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        operationId: input.operationId,
        validationId: input.validationId,
        targetProjectId: input.targetProjectId,
        environmentId: input.environmentId,
        browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
        runIntent: input.name,
      }),
    )
    .digest('hex')}`
}

function assertCapsulePreflightReady(preflight: { status: string; blockers: Array<{ code: string }> }) {
  if (preflight.status !== 'ready') throw new Error(`Capsule preflight blocked: ${preflight.blockers[0]?.code}`)
}

export class RuntimeCapsuleTestRunService {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly appraiseRoot = path.join(process.cwd(), '.appraise'),
  ) {}

  async prepare(input: PrepareCapsuleTestRunInput) {
    const operation = await this.client.validationAstPublishOperation.findUniqueOrThrow({
      where: { id: input.operationId },
      include: { plan: true },
    })
    assertCapsulePreparationOwnership(input, operation)
    const links = reviewedCaseLinks(input, operation)
    const preparationKey = capsulePreparationKey(input)
    return this.client.$transaction(async tx => {
      const [environment, project] = await Promise.all([
        tx.environment.findUnique({ where: { id: input.environmentId } }),
        tx.targetProject.findUnique({ where: { id: input.targetProjectId } }),
      ])
      if (!environment || !project) throw new Error('Capsule TestRun environment or project is missing.')
      const testRun = await tx.testRun.upsert({
        where: { preparationKey },
        update: {},
        create: {
          name: input.name,
          preparationKey,
          environmentId: environment.id,
          browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
          testWorkersCount: 1,
          status: TestRunStatus.QUEUED,
          result: TestRunResult.PENDING,
          planId: input.planId,
          targetProjectId: project.id,
          testCases: {
            create: links.map(link => ({ testCaseId: link.testCaseId, testSuiteId: link.testSuiteId! })),
          },
        },
        include: { environment: true, testCases: true },
      })
      const expectedLinks = new Set(links.map(link => `${link.testCaseId}:${link.testSuiteId}`))
      const actualLinks = new Set(testRun.testCases.map(link => `${link.testCaseId}:${link.testSuiteId}`))
      if (
        testRun.planId !== input.planId ||
        testRun.targetProjectId !== input.targetProjectId ||
        testRun.environmentId !== input.environmentId ||
        expectedLinks.size !== actualLinks.size ||
        [...expectedLinks].some(link => !actualLinks.has(link))
      )
        throw new Error('Existing prepared capsule TestRun identity differs from the request.')
      return testRun
    })
  }

  async start(input: StartCapsuleTestRunInput) {
    let ownedAttempt: { id: string; ownerToken: string; version: number } | undefined
    let failedComponent = 'materialization'
    const [operation, testRun] = await Promise.all([
      this.client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: input.operationId } }),
      this.client.testRun.findUniqueOrThrow({
        where: { id: input.testRunDbId },
        include: {
          environment: true,
          testCases: true,
          runtimeCapsuleExecutionAttempt: { include: { capsule: true } },
        },
      }),
    ])
    assertCapsuleStartOwnership(input, operation, testRun)
    const existingAttempt = reuseExistingExecutionAttempt(input, operation, testRun)
    if (existingAttempt) return existingAttempt
    try {
      const materialized = await new RuntimeCapsuleMaterializer(this.client, this.appraiseRoot).materialize({
        operationId: input.operationId,
        testRunId: testRun.id,
      })
      const paths = resolveRuntimeCapsulePaths({
        appraiseRoot: this.appraiseRoot,
        projectId: input.targetProjectId,
        validationHash: materialized.row.validationHash,
        runId: testRun.runId,
      })
      failedComponent = 'preflight'
      const preflight = await new RuntimeCapsulePreflight(this.client, this.appraiseRoot).check({
        projectId: input.targetProjectId,
        validationHash: materialized.row.validationHash,
        testRunId: testRun.id,
        runId: testRun.runId,
      })
      const ownerToken = crypto.randomUUID()
      const preflightResultJson = canonicalRuntimeCapsuleJson(preflight)
      const attempt = await this.client.runtimeCapsuleExecutionAttempt.upsert({
        where: { testRunId: testRun.id },
        update: {},
        create: {
          testRunId: testRun.id,
          capsuleId: materialized.row.id,
          receiptHash: materialized.manifest.commandReceipt.hash,
          preflightResultJson,
          preflightResultHash: hashRuntimeCapsuleValue(preflight),
          preflightCheckedAt: new Date(preflight.checkedAt),
          state: 'STARTING',
          ownerToken,
        },
      })
      if (
        attempt.capsuleId !== materialized.row.id ||
        attempt.receiptHash !== materialized.manifest.commandReceipt.hash
      )
        throw new Error('Existing capsule execution attempt identity differs from reviewed materialization.')
      if (attempt.ownerToken !== ownerToken)
        return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, state: attempt.state }
      ownedAttempt = { id: attempt.id, ownerToken, version: attempt.version }
      assertCapsulePreflightReady(preflight)
      failedComponent = 'execution-start'
      const claimed = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: attempt.id, state: 'STARTING', ownerToken, version: attempt.version },
        data: { version: { increment: 1 } },
      })
      if (claimed.count !== 1) throw new Error('Capsule execution start ownership changed before spawn.')
      ownedAttempt.version += 1
      const logPath = path.join(paths.capsuleRoot, 'logs/cucumber.log')
      const logger = await createTestRunLogger(testRun.runId, logPath)
      await this.client.testRun.update({ where: { id: testRun.id }, data: { logPath } })
      const adapter = new CapsuleExecutorAdapter(this.client, this.appraiseRoot)
      await scheduleTestRunCompletion({
        testRun,
        environment: testRun.environment,
        tagExpression: '',
        testRunTestCases: testRun.testCases,
        value: {
          name: testRun.name,
          environmentId: testRun.environmentId,
          tags: [],
          testSuites: [],
          testWorkersCount: 1,
          browserEngine: testRun.browserEngine,
        },
        logger,
        prepareWorkspace: false,
        launch: async () => {
          const current = await this.client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({
            where: { id: attempt.id },
          })
          if (current.state !== 'STARTING' || current.ownerToken !== ownerToken)
            throw new Error('Capsule execution was cancelled or superseded before spawn.')
          const launched = await adapter.execute({
            projectId: input.targetProjectId,
            validationHash: materialized.row.validationHash,
            testRunId: testRun.id,
            runId: testRun.runId,
            capsuleRoot: paths.capsuleRoot,
            receiptHash: materialized.manifest.commandReceipt.hash,
          })
          const transitioned = await this.client.$transaction(async tx => {
            const running = await tx.runtimeCapsuleExecutionAttempt.updateMany({
              where: { id: attempt.id, state: 'STARTING', ownerToken },
              data: { state: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
            })
            if (running.count !== 1) return false
            const run = await tx.testRun.updateMany({
              where: { id: testRun.id, status: TestRunStatus.QUEUED },
              data: { status: TestRunStatus.RUNNING },
            })
            if (run.count !== 1) throw new Error('TestRun was cancelled before spawn registration.')
            return true
          })
          if (!transitioned) {
            launched.process.process.kill('SIGTERM')
            throw new Error('Capsule execution ownership changed during spawn registration.')
          }
          return launched
        },
        executionAttempt: { id: attempt.id, ownerToken },
        client: this.client,
        waitForProcess: processName => adapter.waitForProcess(processName),
        appraiseRoot: this.appraiseRoot,
      })
      return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, preflight }
    } catch (error) {
      const failureOwner = ownedAttempt
      if (failureOwner)
        await this.client.$transaction(async tx => {
          const completedAt = new Date()
          const attempt = await tx.runtimeCapsuleExecutionAttempt.updateMany({
            where: {
              id: failureOwner.id,
              ownerToken: failureOwner.ownerToken,
              state: 'STARTING',
              version: failureOwner.version,
            },
            data: {
              state: 'FAILED',
              completedAt,
              failure: error instanceof Error ? error.message : String(error),
              version: { increment: 1 },
            },
          })
          if (attempt.count !== 1) return
          const run = await tx.testRun.updateMany({
            where: { id: testRun.id, status: TestRunStatus.QUEUED },
            data: {
              status: TestRunStatus.COMPLETED,
              result: TestRunResult.FAILED,
              evidenceHealth: 'infrastructure_failure',
              completedAt,
            },
          })
          if (run.count !== 1) throw new Error('TestRun start state changed before owned failure terminalization.')
        })
      else
        await this.client.$transaction(async tx => {
          const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
          await tx.testRunLog.upsert({
            where: { testRunId: testRun.runId },
            create: {
              testRunId: testRun.runId,
              logs: formatLogsForStorage([
                {
                  type: 'stderr',
                  message: `Infrastructure failure in runtime capsule ${failedComponent}: ${message}`,
                  timestamp: new Date(),
                },
              ]),
            },
            update: {
              logs: formatLogsForStorage([
                {
                  type: 'stderr',
                  message: `Infrastructure failure in runtime capsule ${failedComponent}: ${message}`,
                  timestamp: new Date(),
                },
              ]),
            },
          })
          await tx.testRun.updateMany({
            where: { id: testRun.id, status: TestRunStatus.QUEUED },
            data: {
              status: TestRunStatus.COMPLETED,
              result: TestRunResult.FAILED,
              evidenceHealth: 'infrastructure_failure',
              completedAt: new Date(),
            },
          })
        })
      throw error
    }
  }

  private async activeAttemptContext(testRunId: string) {
    const attempt = await this.client.runtimeCapsuleExecutionAttempt.findUnique({ where: { testRunId } })
    if (!attempt || !['STARTING', 'RUNNING'].includes(attempt.state)) return null
    const run = await this.client.testRun.findUniqueOrThrow({ where: { id: testRunId }, select: { runId: true } })
    return { attempt, run }
  }

  async cancel(testRunId: string) {
    const context = await this.activeAttemptContext(testRunId)
    if (!context) return false
    const { attempt, run } = context
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
    if (!cancelled) return false
    const process = (await import('@/lib/test-run/process-manager')).processManager.get(run.runId)
    process?.process.kill('SIGTERM')
    return true
  }

  async recoverInterrupted(testRunId: string) {
    const context = await this.activeAttemptContext(testRunId)
    if (!context) return false
    const { attempt, run } = context
    const { processManager } = await import('@/lib/test-run/process-manager')
    if (processManager.has(run.runId)) return false
    return this.client.$transaction(async tx => {
      const recovered = await tx.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: attempt.id, state: attempt.state, ownerToken: attempt.ownerToken, version: attempt.version },
        data: {
          state: 'INTERRUPTED',
          completedAt: new Date(),
          failure: 'process registry missing after restart',
          version: { increment: 1 },
        },
      })
      if (recovered.count !== 1) return false
      await tx.testRun.updateMany({
        where: { id: testRunId, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
        data: {
          status: TestRunStatus.COMPLETED,
          result: TestRunResult.FAILED,
          evidenceHealth: 'infrastructure_failure',
          completedAt: new Date(),
        },
      })
      return true
    })
  }
}
