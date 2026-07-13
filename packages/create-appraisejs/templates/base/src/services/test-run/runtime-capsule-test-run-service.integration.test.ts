import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { PrismaClient, TestRunResult, TestRunStatus } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  RuntimeCapsuleMaterializer,
  RuntimeCapsulePreflight,
  type RuntimeCapsuleManifest,
} from '@/lib/runtime-capsule'
import { CapsuleExecutorAdapter } from '@/lib/executor/capsule-executor-adapter'
import { processManager } from '@/lib/test-run/process-manager'
import { spawnTask, waitForTask, type SpawnedProcess } from '@/lib/process/task-spawner'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import { seedReviewedCapsuleLifecycleFixture } from '@/test/reviewed-capsule-lifecycle-fixture'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'
import { TestRunArtifactAccessService } from './test-run-artifact-access-service'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'
import { getTestRunLogsService, scheduleTestRunCompletion } from './test-run-service'
import { summarizeRunEvidence } from './run-evidence-summary-service'

const hash = (character: string) => `sha256:${character.repeat(64)}`
const preflight = {
  schemaVersion: '1' as const,
  receiptHash: hash('5'),
  status: 'blocked' as const,
  checks: [
    { order: 0, stage: 'receipt' as const, code: 'RECEIPT_INVALID' as const, status: 'failed' as const },
    ...(
      [
        'ownership',
        'manifest',
        'filesystem',
        'runtime',
        'cucumber-singleton',
        'config',
        'loader-compiler',
        'environment-capabilities',
        'selection',
        'expected-evidence',
        'outputs',
        'dry-run',
      ] as const
    ).map((stage, index) => ({ order: index + 1, stage, code: 'CHECK_PASSED' as const, status: 'skipped' as const })),
  ],
  blockers: [{ code: 'RECEIPT_INVALID' as const, recoveryAction: 'Rematerialize the receipt.' }],
  resolved: {},
  checkedAt: '2026-07-12T00:00:00.000Z',
}
const readyPreflight = {
  ...preflight,
  status: 'ready' as const,
  checks: preflight.checks.map((check, index) => ({
    ...check,
    code: index === 12 ? ('PREFLIGHT_READY' as const) : ('CHECK_PASSED' as const),
    status: 'passed' as const,
  })),
  blockers: [],
}
const planId = 'capsule-lifecycle-plan'
const validationId = 'validation-one'
let workspace: string
let client: PrismaClient
let service: RuntimeCapsuleTestRunService
let projectId: string
let environmentId: string
let operationId: string

beforeAll(async () => {
  ;({ workspace, client } = await createPlanRuntimeTestWorkspace('appraise-capsule-lifecycle-', 'appraise.db'))
  service = new RuntimeCapsuleTestRunService(client, path.join(workspace, '.appraise'))
  const project = await client.targetProject.create({
    data: { canonicalPath: workspace, displayName: 'Capsule target', fingerprint: hash('1') },
  })
  projectId = project.id
  environmentId = (
    await client.environment.create({ data: { name: 'capsule-lifecycle', baseUrl: 'http://localhost' } })
  ).id
  const plan = await client.planProjection.create({
    data: {
      planId,
      revision: 1,
      lifecycle: 'awaiting_validation_review',
      goal: 'Exercise lifecycle races',
      description: 'Exercise lifecycle races',
      sourceHash: hash('2'),
      planPath: 'capsule-lifecycle.yaml',
      lastValidProjectedAt: new Date(),
      targetProjectId: projectId,
    },
  })
  const validation = {
    version: '1',
    planId,
    revision: 1,
    baseRevision: { gitCommit: null, snapshotHash: hash('3'), reducedAssurance: false },
    classificationOverrides: [],
    validations: [
      {
        id: validationId,
        taskIds: ['task-one'],
        required: true,
        testCaseIds: ['case-one'],
        appraiseArtifacts: {
          modules: [{ id: 'module-one', name: 'Module' }],
          testSuites: [{ id: 'suite-one', name: 'Suite', moduleId: 'module-one', testCaseIds: ['case-one'] }],
          testCases: [{ id: 'case-one', title: 'Case', description: 'Case', steps: [] }],
          locatorGroups: [],
          locators: [],
        },
        gherkinPaths: ['automation/features/case.feature'],
        stepPaths: [],
        executable: { path: 'automation/features/case.feature' },
        astProvenance: {
          schemaVersion: '2',
          astHash: hash('4'),
          executionAuthority: 'reviewed_publication',
          publishOperationId: 'operation-placeholder',
          receiptHash: hash('5'),
          runtimeInputHash: hash('6'),
        },
        matrix: [{ browser: 'chromium', environment: 'capsule-lifecycle' }],
        expectedFailures: [],
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [],
    manifestPaths: [],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  }
  operationId = 'operation-one'
  validation.validations[0]!.astProvenance.publishOperationId = operationId
  await client.validationAstPublishOperation.create({
    data: {
      id: operationId,
      planId,
      planProjectionId: plan.id,
      targetProjectId: projectId,
      targetFingerprint: project.fingerprint,
      idempotencyKey: 'lifecycle',
      operationHash: hash('7'),
      phase: 'review_ready',
      expectedPlanHash: hash('8'),
      expectedPlanArtifactHash: hash('9'),
      expectedReviewHash: hash('a'),
      planHash: hash('b'),
      validationHash: hash('c'),
      reviewHash: hash('d'),
      planContent: '{}',
      validationContent: '{}',
      reviewContent: '{}',
      astId: validationId,
      astHash: hash('4'),
      contextHash: hash('e'),
      previewHash: hash('f'),
      receiptHash: hash('5'),
      projectionHash: hash('0'),
      projectionJson: '{}',
      validationProjectionJson: JSON.stringify(validation),
      runtimeInputHash: hash('6'),
      runtimeInputJson: '{}',
    },
  })
  const appModule = await client.module.create({ data: { id: 'module-one', name: 'Module' } })
  const testCase = await client.testCase.create({
    data: { id: 'case-one', title: 'Case', description: 'Case' },
  })
  await client.testSuite.create({
    data: { id: 'suite-one', name: 'Suite', moduleId: appModule.id, testCases: { connect: { id: testCase.id } } },
  })
})

afterAll(async () => {
  processManager.clear()
  await client?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

beforeEach(() => processManager.clear())

it('enforces capsule artifact ownership, containment, integrity, and size in real SQLite', async () => {
  const suffix = Date.now().toString(36)
  const targetId = `artifact-target-${suffix}`
  const targetRoot = path.join(workspace, targetId)
  await fs.mkdir(targetRoot, { recursive: true })
  const fixture = await seedReviewedCapsuleLifecycleFixture({
    client,
    workspace,
    environmentId,
    projectId: targetId,
    planId: `artifact-plan-${suffix}`,
    runId: `artifact-run-${suffix}`,
  })
  const foreign = await seedReviewedCapsuleLifecycleFixture({
    client,
    workspace,
    environmentId,
    projectId: `artifact-foreign-${suffix}`,
    planId: `artifact-foreign-plan-${suffix}`,
    runId: `artifact-foreign-run-${suffix}`,
  })
  await expect(
    client.targetProject.count({ where: { displayName: 'Same display name' } }),
  ).resolves.toBeGreaterThanOrEqual(2)
  const materialized = await new RuntimeCapsuleMaterializer(client, path.join(workspace, '.appraise')).materialize({
    operationId: fixture.operationId,
    testRunId: fixture.testRun!.id,
  })
  const capsuleRoot = path.join(workspace, '.appraise', 'projects', targetId, materialized.row.storagePath)
  const receipt = JSON.parse(await fs.readFile(path.join(capsuleRoot, 'command-receipt.json'), 'utf8')) as {
    outputs: { report: { path: string; maxBytes: number }; log: { path: string; maxBytes: number } }
  }
  const reportPath = path.join(capsuleRoot, receipt.outputs.report.path)
  const logPath = path.join(capsuleRoot, receipt.outputs.log.path)
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.mkdir(path.dirname(logPath), { recursive: true })
  await fs.writeFile(reportPath, '[]')
  await fs.writeFile(logPath, 'bounded log')
  await client.testRun.update({ where: { id: fixture.testRun!.id }, data: { reportPath: receipt.outputs.report.path } })
  const access = new TestRunArtifactAccessService(client, path.join(workspace, '.appraise'))

  await expect(
    getTestRunLogsService(fixture.testRun!.runId, targetId, path.join(workspace, '.appraise'), client),
  ).resolves.toEqual([expect.objectContaining({ type: 'stdout', message: 'bounded log' })])
  await expect(
    summarizeRunEvidence(fixture.testRun!.runId, client, path.join(workspace, '.appraise')),
  ).resolves.toMatchObject({ evidenceHealth: 'invalid_empty_run' })

  const originalReportPath = `${reportPath}.original`
  const swapAwareAccess = new TestRunArtifactAccessService(
    client,
    path.join(workspace, '.appraise'),
    async (filePath, flags) => {
      await fs.rename(filePath, originalReportPath)
      await fs.writeFile(filePath, '[]')
      return fs.open(filePath, flags)
    },
  )
  await expect(swapAwareAccess.readBytes({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(reportPath)
  await fs.rename(originalReportPath, reportPath)

  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).resolves.toMatchObject({
    absolutePath: await fs.realpath(reportPath),
    contentType: 'application/json',
  })
  await expect(
    access.resolve({
      runId: fixture.testRun!.runId,
      kind: 'report',
      expectedTargetProjectId: targetId,
    }),
  ).resolves.toMatchObject({ contentType: 'application/json' })
  await expect(
    access.resolve({
      runId: fixture.testRun!.runId,
      kind: 'report',
      expectedTargetProjectId: `artifact-foreign-${suffix}`,
    }),
  ).rejects.toMatchObject({ statusCode: 404 })
  await expect(access.resolve({ runId: 'foreign-run', kind: 'report' })).rejects.toMatchObject({ statusCode: 404 })
  await expect(access.resolve({ runId: foreign.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 404,
  })
  await expect(
    access.resolve({
      runId: fixture.testRun!.runId,
      kind: 'trace',
      testCaseId: 'foreign-case',
      storedPath: reportPath,
    }),
  ).rejects.toMatchObject({ statusCode: 404 })

  const originalManifest = materialized.row.manifestJson
  await client.runtimeCapsule.update({
    where: { id: materialized.row.id },
    data: { manifestJson: `${originalManifest} ` },
  })
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await client.runtimeCapsule.update({ where: { id: materialized.row.id }, data: { manifestJson: originalManifest } })

  const receiptPath = path.join(capsuleRoot, 'command-receipt.json')
  const originalReceipt = await fs.readFile(receiptPath)
  await fs.writeFile(receiptPath, Buffer.concat([originalReceipt, Buffer.from(' ')]))
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.writeFile(receiptPath, originalReceipt)

  const movedReport = `${reportPath}.real`
  await fs.rename(reportPath, movedReport)
  await fs.symlink(movedReport, reportPath)
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(reportPath)
  await fs.rename(movedReport, reportPath)

  const reportsDirectory = path.dirname(reportPath)
  const movedReportsDirectory = `${reportsDirectory}.real`
  await fs.rename(reportsDirectory, movedReportsDirectory)
  await fs.symlink(movedReportsDirectory, reportsDirectory)
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(reportsDirectory)
  await fs.rename(movedReportsDirectory, reportsDirectory)

  const movedCapsuleRoot = `${capsuleRoot}.real`
  await fs.rename(capsuleRoot, movedCapsuleRoot)
  await fs.symlink(movedCapsuleRoot, capsuleRoot)
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(capsuleRoot)
  await fs.rename(movedCapsuleRoot, capsuleRoot)

  const projectRoot = path.dirname(path.dirname(path.dirname(capsuleRoot)))
  const movedProjectRoot = `${projectRoot}.real`
  await fs.rename(projectRoot, movedProjectRoot)
  await fs.symlink(movedProjectRoot, projectRoot)
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(projectRoot)
  await fs.rename(movedProjectRoot, projectRoot)

  await fs.writeFile(reportPath, Buffer.alloc(receipt.outputs.report.maxBytes + 1))
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 409,
  })
  await fs.unlink(reportPath)
  await expect(access.resolve({ runId: fixture.testRun!.runId, kind: 'report' })).rejects.toMatchObject({
    statusCode: 404,
  })
})

const prepareInput = (name: string) => ({
  operationId,
  planId,
  validationId,
  targetProjectId: projectId,
  environmentId,
  name,
})

async function seededAttempt(state: 'STARTING' | 'RUNNING' | 'COMPLETED' = 'RUNNING', operationHash = hash('7')) {
  const run = await client.testRun.create({
    data: {
      name: `attempt-${crypto.randomUUID()}`,
      environmentId,
      planId,
      targetProjectId: projectId,
      status: state === 'COMPLETED' ? TestRunStatus.COMPLETED : TestRunStatus.RUNNING,
      result: state === 'COMPLETED' ? TestRunResult.PASSED : TestRunResult.PENDING,
    },
  })
  const receiptHash = hash('5')
  const manifestJson = canonicalRuntimeCapsuleJson({
    schemaVersion: '1',
    projectId,
    validationHash: hash('4'),
    runId: run.runId,
    operationHash,
    projectionHash: hash('0'),
    receiptHash,
    runtimeInputHash: hash('6'),
    commandReceipt: { path: 'command-receipt.json', hash: receiptHash },
    generator: { id: 'appraise.validation-ast-capsule', version: '1' },
    expectedCases: [],
    files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: receiptHash, size: 2 }],
  })
  const capsule = await client.runtimeCapsule.create({
    data: {
      targetProjectId: projectId,
      testRunId: run.id,
      validationHash: hash('4'),
      capsuleHash: hash('a'),
      manifestHash: hash('b'),
      manifestJson,
      storagePath: `capsules/${run.runId}`,
      integrityState: 'ready',
    },
  })
  const attempt = await client.runtimeCapsuleExecutionAttempt.create({
    data: {
      testRunId: run.id,
      capsuleId: capsule.id,
      receiptHash,
      preflightResultJson: canonicalRuntimeCapsuleJson(preflight),
      preflightResultHash: hashRuntimeCapsuleValue(preflight),
      preflightCheckedAt: new Date(preflight.checkedAt),
      state,
      ownerToken: crypto.randomUUID(),
    },
  })
  return { run, attempt }
}

async function createReadyCapsule(name: string) {
  const prepared = await service.prepare(prepareInput(`${name}-${crypto.randomUUID()}`))
  const receiptHash = hash('5')
  const manifest: RuntimeCapsuleManifest = {
    schemaVersion: '1',
    projectId,
    validationHash: hash('4'),
    runId: prepared.runId,
    operationHash: hash('7'),
    projectionHash: hash('0'),
    receiptHash,
    runtimeInputHash: hash('6'),
    commandReceipt: { path: 'command-receipt.json', hash: receiptHash },
    generator: { id: 'appraise.validation-ast-capsule', version: '1' },
    expectedCases: [],
    files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: receiptHash, size: 2 }],
  }
  const capsule = await client.runtimeCapsule.create({
    data: {
      targetProjectId: projectId,
      testRunId: prepared.id,
      validationHash: manifest.validationHash,
      capsuleHash: hash('a'),
      manifestHash: hash('b'),
      manifestJson: canonicalRuntimeCapsuleJson(manifest),
      storagePath: `capsules/${prepared.runId}`,
      integrityState: 'ready',
    },
  })
  return { prepared, manifest, capsule }
}

function registerActiveProcess(runId: string, kill?: ChildProcess['kill']) {
  const child = new EventEmitter() as ChildProcess
  if (kill) child.kill = kill
  const spawned = {
    process: child,
    pid: 1,
    name: `capsule-${runId}`,
    output: { stdout: [], stderr: [] },
    isRunning: true,
    exitCode: null,
    startTime: new Date(),
    endTime: null,
  } satisfies SpawnedProcess
  processManager.register(runId, spawned)
  return spawned
}

async function expectCancelled(testRunId: string) {
  await expect(
    client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId } }),
  ).resolves.toMatchObject({ state: 'CANCELLED' })
  await expect(client.testRun.findUniqueOrThrow({ where: { id: testRunId } })).resolves.toMatchObject({
    status: 'CANCELLED',
    result: 'CANCELLED',
  })
}

describe('RuntimeCapsuleTestRunService SQLite lifecycle races', () => {
  it('makes repeated and simultaneous prepare calls idempotent', async () => {
    const input = prepareInput(`prepare-${crypto.randomUUID()}`)
    const [first, second] = await Promise.all([service.prepare(input), service.prepare(input)])
    expect(first.id).toBe(second.id)
    await expect(client.testRun.count({ where: { name: input.name } })).resolves.toBe(1)
  })

  it('allows unrelated immutable preparations to share a display name', async () => {
    const name = `collision-${crypto.randomUUID()}`
    await client.testRun.create({ data: { name, environmentId } })
    await expect(service.prepare(prepareInput(name))).resolves.toMatchObject({ name, planId })
    await expect(client.testRun.count({ where: { name } })).resolves.toBe(2)
  })

  it('cancels during STARTING without leaving a running TestRun', async () => {
    const { run } = await seededAttempt('STARTING')
    await expect(service.cancel(run.id)).resolves.toBe(true)
    await expectCancelled(run.id)
  })

  it('rolls back attempt cancellation when the TestRun CAS cannot commit', async () => {
    const { run, attempt } = await seededAttempt('RUNNING')
    await client.testRun.update({ where: { id: run.id }, data: { status: TestRunStatus.COMPLETED } })
    await expect(service.cancel(run.id)).rejects.toThrow(/terminal state changed/)
    await expect(
      client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
    ).resolves.toMatchObject({
      state: 'RUNNING',
      version: attempt.version,
    })
  })

  it('kills the registered process when cancelling RUNNING', async () => {
    const { run } = await seededAttempt('RUNNING')
    const kill = vi.fn(() => true)
    const process = registerActiveProcess(run.runId, kill as ChildProcess['kill'])
    await expect(service.cancel(run.id)).resolves.toBe(true)
    expect(kill).toHaveBeenCalledWith('SIGTERM')
    expect(processManager.get(run.runId)).toBe(process)
  })

  it('does not recover a still-registered active process', async () => {
    const { run } = await seededAttempt('RUNNING')
    registerActiveProcess(run.runId)
    await expect(service.recoverInterrupted(run.id)).resolves.toBe(false)
    await expect(
      client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId: run.id } }),
    ).resolves.toMatchObject({ state: 'RUNNING' })
  })

  it('recovers an unregistered RUNNING owner exactly once', async () => {
    const { run } = await seededAttempt('RUNNING')
    const [first, second] = await Promise.all([service.recoverInterrupted(run.id), service.recoverInterrupted(run.id)])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    await expect(
      client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId: run.id } }),
    ).resolves.toMatchObject({ state: 'INTERRUPTED' })
    await expect(client.testRun.findUniqueOrThrow({ where: { id: run.id } })).resolves.toMatchObject({
      status: 'COMPLETED',
      result: 'FAILED',
    })
  })

  it('keeps CANCELLED terminal when recovery and completion attempt stale CAS writes', async () => {
    const { run, attempt } = await seededAttempt('RUNNING')
    await service.cancel(run.id)
    await client.runtimeCapsuleExecutionAttempt.updateMany({
      where: { id: attempt.id, ownerToken: attempt.ownerToken, state: 'RUNNING', version: attempt.version },
      data: { state: 'COMPLETED', version: { increment: 1 } },
    })
    await client.testRun.updateMany({
      where: { id: run.id, status: { in: [TestRunStatus.QUEUED, TestRunStatus.RUNNING] } },
      data: { status: TestRunStatus.COMPLETED, result: TestRunResult.PASSED },
    })
    await expect(
      client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
    ).resolves.toMatchObject({ state: 'CANCELLED' })
    await expectCancelled(run.id)
  })

  it('returns a terminal attempt idempotently but blocks publication identity drift', async () => {
    const terminal = await seededAttempt('COMPLETED')
    const input = { ...prepareInput(terminal.run.name), testRunDbId: terminal.run.id }
    await expect(service.start(input)).resolves.toMatchObject({ attemptId: terminal.attempt.id, state: 'COMPLETED' })
    const drifted = await seededAttempt('COMPLETED', hash('9'))
    await expect(service.start({ ...input, name: drifted.run.name, testRunDbId: drifted.run.id })).rejects.toThrow(
      /identity differs/,
    )
    await expect(client.runtimeCapsuleExecutionAttempt.count({ where: { testRunId: terminal.run.id } })).resolves.toBe(
      1,
    )
  })

  it('isolates the winning start when a concurrent start fails during materialization', async () => {
    const { prepared, manifest, capsule } = await createReadyCapsule('two-start')
    let materializationCalls = 0
    let releaseLosingMaterialization!: () => void
    const losingMaterialization = new Promise<void>(resolve => {
      releaseLosingMaterialization = resolve
    })
    let secondStartEntered!: () => void
    const secondStartDidEnter = new Promise<void>(resolve => {
      secondStartEntered = resolve
    })
    const materialize = vi.spyOn(RuntimeCapsuleMaterializer.prototype, 'materialize').mockImplementation(async () => {
      materializationCalls += 1
      if (materializationCalls === 1) return { row: capsule, manifest } as never
      secondStartEntered()
      await losingMaterialization
      throw new Error('losing materialization rejected')
    })
    const check = vi.spyOn(RuntimeCapsulePreflight.prototype, 'check').mockResolvedValue(readyPreflight as never)
    const child = new EventEmitter() as ChildProcess
    child.kill = vi.fn(() => true) as ChildProcess['kill']
    const spawned = {
      process: child,
      pid: 1,
      name: `capsule-${prepared.runId}`,
      output: { stdout: [], stderr: [] },
      isRunning: true,
      exitCode: null,
      startTime: new Date(),
      endTime: null,
    } satisfies SpawnedProcess
    const execute = vi.spyOn(CapsuleExecutorAdapter.prototype, 'execute').mockResolvedValue({
      process: spawned,
      reportPath: path.join(workspace, `${prepared.runId}-two-start-report.json`),
    })
    const wait = vi.spyOn(CapsuleExecutorAdapter.prototype, 'waitForProcess').mockReturnValue(new Promise(() => {}))
    const input = { ...prepareInput(prepared.name), testRunDbId: prepared.id }

    try {
      const winner = service.start(input)
      const loser = service.start(input)
      await secondStartDidEnter
      const winningResult = await winner
      const winningAttempt = await client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({
        where: { testRunId: prepared.id },
      })
      const winningRun = await client.testRun.findUniqueOrThrow({ where: { id: prepared.id } })

      releaseLosingMaterialization()
      await expect(loser).rejects.toThrow('losing materialization rejected')
      await expect(
        client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId: prepared.id } }),
      ).resolves.toMatchObject({
        id: winningAttempt.id,
        ownerToken: winningAttempt.ownerToken,
        state: 'RUNNING',
        version: winningAttempt.version,
      })
      await expect(client.testRun.findUniqueOrThrow({ where: { id: prepared.id } })).resolves.toMatchObject({
        id: winningRun.id,
        status: 'RUNNING',
        result: 'PENDING',
      })
      expect(winningResult).toMatchObject({ attemptId: winningAttempt.id, testRunId: prepared.id })
      expect(execute).toHaveBeenCalledTimes(1)
    } finally {
      releaseLosingMaterialization()
      materialize.mockRestore()
      check.mockRestore()
      execute.mockRestore()
      wait.mockRestore()
    }
  })

  it('keeps cancellation terminal when a real child process exits concurrently', async () => {
    const { run, attempt } = await seededAttempt('STARTING')
    const testRun = await client.testRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { environment: true, testCases: true },
    })
    const logger = await createTestRunLogger(run.runId, path.join(workspace, `${run.runId}-cancel.log`))
    await scheduleTestRunCompletion({
      testRun,
      environment: testRun.environment,
      tagExpression: '',
      testRunTestCases: [],
      value: {
        name: testRun.name,
        environmentId,
        tags: [],
        testSuites: [],
        testWorkersCount: 1,
        browserEngine: testRun.browserEngine,
      },
      logger,
      prepareWorkspace: false,
      client,
      waitForProcess: waitForTask,
      launch: async () => {
        const spawned = await spawnTask(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 500)'], {
          captureOutput: true,
          streamLogs: false,
          retainProcessRecord: true,
        })
        processManager.register(run.runId, spawned)
        spawned.process.once('exit', () => processManager.unregister(run.runId))
        await client.$transaction([
          client.runtimeCapsuleExecutionAttempt.update({
            where: { id: attempt.id },
            data: { state: 'RUNNING', version: { increment: 1 } },
          }),
          client.testRun.update({ where: { id: run.id }, data: { status: TestRunStatus.RUNNING } }),
        ])
        return { process: spawned, reportPath: path.join(workspace, 'cancelled-report.json') }
      },
      executionAttempt: { id: attempt.id, ownerToken: attempt.ownerToken },
    })
    await expect(service.cancel(run.id)).resolves.toBe(true)

    await vi.waitFor(
      async () => {
        await expect(client.testRun.findUniqueOrThrow({ where: { id: run.id } })).resolves.toMatchObject({
          status: 'CANCELLED',
          result: 'CANCELLED',
        })
        await expect(
          client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
        ).resolves.toMatchObject({ state: 'CANCELLED' })
      },
      { timeout: 5_000 },
    )
  })

  it('terminalizes a spawn failure without leaking STARTING, RUNNING, or QUEUED state', async () => {
    const { prepared, manifest, capsule } = await createReadyCapsule('spawn-failure')
    vi.spyOn(RuntimeCapsuleMaterializer.prototype, 'materialize').mockResolvedValue({
      row: capsule,
      manifest,
    } as never)
    vi.spyOn(RuntimeCapsulePreflight.prototype, 'check').mockResolvedValue(readyPreflight as never)
    vi.spyOn(CapsuleExecutorAdapter.prototype, 'execute').mockRejectedValue(new Error('spawn rejected'))

    await expect(service.start({ ...prepareInput(prepared.name), testRunDbId: prepared.id })).rejects.toThrow(
      'spawn rejected',
    )
    await expect(client.testRun.findUniqueOrThrow({ where: { id: prepared.id } })).resolves.toMatchObject({
      status: 'COMPLETED',
      result: 'FAILED',
      evidenceHealth: 'infrastructure_failure',
    })
    await expect(
      client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId: prepared.id } }),
    ).resolves.toMatchObject({ state: 'FAILED', failure: 'spawn rejected' })
  })
})
