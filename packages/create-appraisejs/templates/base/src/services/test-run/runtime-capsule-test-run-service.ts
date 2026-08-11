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
import { validationArtifactSchema } from '@/lib/quality-design/validation-artifact-contract'
import { persistProjectedExecutionArtifacts } from '@/services/coordinator/quality-validation-publication-service'
import { scheduleTestRunCompletion } from './test-run-service'

/** Quality-owned execution never fabricates a ready capsule. It is prepared
 * against the immutable ValidationVersion publication and then uses the same
 * materializer, preflight, executor and cancellation state machine. */
export type PrepareQualityCapsuleTestRunInput = {
  publicationId: string
  validationVersionId: string
  targetProjectId: string
  environmentId: string
  name: string
  browserEngine?: BrowserEngine
  preparationKey?: string
}
export type StartQualityCapsuleTestRunInput = PrepareQualityCapsuleTestRunInput & { testRunDbId: string }

function qualityCapsulePreparationKey(input: PrepareQualityCapsuleTestRunInput) {
  if (input.preparationKey) return input.preparationKey
  return `sha256:${crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        publicationId: input.publicationId,
        validationVersionId: input.validationVersionId,
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

  async prepareQuality(input: PrepareQualityCapsuleTestRunInput) {
    const publication = await this.client.qualityValidationPublication.findUniqueOrThrow({
      where: { id: input.publicationId },
    })
    if (
      publication.phase !== 'review_ready' ||
      publication.targetProjectId !== input.targetProjectId ||
      publication.validationVersionId !== input.validationVersionId
    )
      throw new Error('Quality capsule publication ownership does not match the preparation request.')
    const validation = validationArtifactSchema.parse(JSON.parse(publication.validationProjectionJson))
    const node = validation.validations.find(item => item.id === publication.astId)
    if (!node || node.astProvenance?.publishOperationId !== publication.id)
      throw new Error('Quality capsule preparation requires the exact reviewed validation projection.')
    const suiteByCase = new Map(
      node.appraiseArtifacts.testSuites.flatMap(suite => suite.testCaseIds.map(id => [id, suite.id] as const)),
    )
    const links = node.appraiseArtifacts.testCases.map(testCase => ({
      testCaseId: testCase.id,
      testSuiteId: suiteByCase.get(testCase.id),
    }))
    if (links.some(link => !link.testSuiteId) || links.length !== node.testCaseIds.length)
      throw new Error('Quality capsule expected case/suite associations are incomplete.')
    const preparationKey = qualityCapsulePreparationKey(input)
    return this.client.$transaction(async tx => {
      const [environment, project] = await Promise.all([
        tx.environment.findUnique({ where: { id: input.environmentId } }),
        tx.targetProject.findUnique({ where: { id: input.targetProjectId } }),
      ])
      if (!environment || !project) throw new Error('Quality capsule environment or project is missing.')
      await persistProjectedExecutionArtifacts(tx, { targetProjectId: input.targetProjectId, node })
      const testRun = await tx.testRun.upsert({
        where: { targetProjectId_preparationKey: { targetProjectId: input.targetProjectId, preparationKey } },
        update: {},
        create: {
          name: input.name,
          preparationKey,
          environmentId: environment.id,
          browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
          testWorkersCount: 1,
          status: TestRunStatus.QUEUED,
          result: TestRunResult.PENDING,
          targetProjectId: project.id,
          testCases: { create: links.map(link => ({ testCaseId: link.testCaseId, testSuiteId: link.testSuiteId! })) },
        },
        include: { environment: true, testCases: true },
      })
      const expectedLinks = new Set(links.map(link => `${link.testCaseId}:${link.testSuiteId}`))
      const actualLinks = new Set(testRun.testCases.map(link => `${link.testCaseId}:${link.testSuiteId}`))
      if (
        testRun.targetProjectId !== input.targetProjectId ||
        testRun.environmentId !== input.environmentId ||
        expectedLinks.size !== actualLinks.size ||
        [...expectedLinks].some(link => !actualLinks.has(link))
      )
        throw new Error('Existing prepared Quality capsule TestRun identity differs from the request.')
      return testRun
    })
  }

  async startQuality(input: StartQualityCapsuleTestRunInput) {
    let ownedAttempt: { id: string; ownerToken: string; version: number } | undefined
    let failedComponent = 'materialization'
    const [publication, testRun] = await Promise.all([
      this.client.qualityValidationPublication.findUniqueOrThrow({ where: { id: input.publicationId } }),
      this.client.testRun.findUniqueOrThrow({
        where: { id: input.testRunDbId },
        include: { environment: true, testCases: true, runtimeCapsuleExecutionAttempt: { include: { capsule: true } } },
      }),
    ])
    if (
      publication.phase !== 'review_ready' ||
      publication.targetProjectId !== input.targetProjectId ||
      publication.validationVersionId !== input.validationVersionId ||
      testRun.targetProjectId !== input.targetProjectId ||
      testRun.environmentId !== input.environmentId
    )
      throw new Error('Prepared Quality capsule TestRun ownership differs from the start request.')
    if (testRun.status !== TestRunStatus.QUEUED)
      throw new Error('Prepared Quality capsule TestRun is no longer queued for execution.')
    const existing = testRun.runtimeCapsuleExecutionAttempt
    if (existing) {
      if (existing.capsule.qualityPublicationId !== publication.id)
        throw new Error('Existing capsule execution attempt lacks the exact Quality publication binding.')
      const manifest = parseCanonicalRuntimeCapsuleManifest(existing.capsule.manifestJson)
      if (manifest.operationHash !== publication.operationHash)
        throw new Error('Existing Quality capsule execution attempt identity differs from the publication.')
      return { testRunId: testRun.id, runId: testRun.runId, attemptId: existing.id, state: existing.state }
    }
    try {
      const materialized = await new RuntimeCapsuleMaterializer(this.client, this.appraiseRoot).materializeQuality({
        publicationId: publication.id,
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
      const attempt = await this.client.$transaction(async tx => {
        const claimedRun = await tx.testRun.updateMany({
          where: { id: testRun.id, status: TestRunStatus.QUEUED },
          data: { status: TestRunStatus.RUNNING },
        })
        if (claimedRun.count !== 1) throw new Error('Quality TestRun was cancelled before execution claim.')
        return tx.runtimeCapsuleExecutionAttempt.upsert({
          where: { testRunId: testRun.id },
          update: {},
          create: {
            testRunId: testRun.id,
            capsuleId: materialized.row.id,
            receiptHash: materialized.manifest.commandReceipt.hash,
            preflightResultJson: canonicalRuntimeCapsuleJson(preflight),
            preflightResultHash: hashRuntimeCapsuleValue(preflight),
            preflightCheckedAt: new Date(preflight.checkedAt),
            state: 'STARTING',
            ownerToken,
          },
        })
      })
      if (
        attempt.capsuleId !== materialized.row.id ||
        attempt.receiptHash !== materialized.manifest.commandReceipt.hash
      )
        throw new Error('Existing capsule execution attempt identity differs from reviewed Quality materialization.')
      if (attempt.ownerToken !== ownerToken)
        return { testRunId: testRun.id, runId: testRun.runId, attemptId: attempt.id, state: attempt.state }
      ownedAttempt = { id: attempt.id, ownerToken, version: attempt.version }
      assertCapsulePreflightReady(preflight)
      failedComponent = 'execution-start'
      const claimed = await this.client.runtimeCapsuleExecutionAttempt.updateMany({
        where: { id: attempt.id, state: 'STARTING', ownerToken, version: attempt.version },
        data: { version: { increment: 1 } },
      })
      if (claimed.count !== 1) throw new Error('Quality capsule execution start ownership changed before spawn.')
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
            throw new Error('Quality capsule execution was cancelled or superseded before spawn.')
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
            const run = await tx.testRun.findUnique({ where: { id: testRun.id }, select: { status: true } })
            if (run?.status !== TestRunStatus.RUNNING)
              throw new Error('Quality TestRun was cancelled before spawn registration.')
            return true
          })
          if (!transitioned) {
            launched.process.process.kill('SIGTERM')
            throw new Error('Quality capsule execution ownership changed during spawn registration.')
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
      const completedAt = new Date()
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
      if (ownedAttempt) {
        await this.client.runtimeCapsuleExecutionAttempt.updateMany({
          where: {
            id: ownedAttempt.id,
            ownerToken: ownedAttempt.ownerToken,
            state: 'STARTING',
            version: ownedAttempt.version,
          },
          data: { state: 'FAILED', completedAt, failure: message, version: { increment: 1 } },
        })
      }
      await this.client.testRun.updateMany({
        where: { id: testRun.id, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
        data: {
          status: TestRunStatus.COMPLETED,
          result: TestRunResult.FAILED,
          evidenceHealth: 'infrastructure_failure',
          completedAt,
        },
      })
      await this.client.testRunLog.upsert({
        where: { testRunId: testRun.runId },
        create: {
          testRunId: testRun.runId,
          logs: formatLogsForStorage([
            {
              type: 'stderr',
              message: `Infrastructure failure in Quality runtime capsule ${failedComponent}: ${message}`,
              timestamp: completedAt,
            },
          ]),
        },
        update: {
          logs: formatLogsForStorage([
            {
              type: 'stderr',
              message: `Infrastructure failure in Quality runtime capsule ${failedComponent}: ${message}`,
              timestamp: completedAt,
            },
          ]),
        },
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
