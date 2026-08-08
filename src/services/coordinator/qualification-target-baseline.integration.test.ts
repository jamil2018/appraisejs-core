import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ValidationArtifact } from '@/lib/plan-contract'
import { processManager } from '@/lib/test-run/process-manager'
import {
  copyMigratedTestDatabase,
  prepareCleanCoordinatorPlanRuntimeTestDatabase,
} from '@/test/plan-runtime-schema-test-helper'
import {
  reviewedCapsuleHashText,
  reviewedCapsuleHashValue,
  seedReviewedCapsuleLifecycleFixture,
  type ReviewedExtensionFixture,
} from '@/test/reviewed-capsule-lifecycle-fixture'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'

import {
  acceptBaseline,
  acknowledgeBaselineFailure,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  startBaselineExecution,
  startImplementation,
} from './coordinator-baseline-service'

const qualificationTargetsRoot = path.resolve(process.cwd(), 'scripts/fixtures/qualification-targets')
const expectedDraftFailure = 'QUALIFICATION_PRODUCT_FAILURE expected saved editor state'

type StartedTarget = {
  child: ChildProcess
  url: string
  page: string
}

let workspace: string
let client: PrismaClient

async function waitForReady(child: ChildProcess, marker: RegExp) {
  let output = ''
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) =>
      reject(new Error(`Target exited before readiness (code=${code}, signal=${signal}).`)),
    )
    child.stdout?.on('data', chunk => {
      output += String(chunk)
      if (marker.test(output)) resolve()
    })
  })
  return output
}

async function startEditorTarget(target: 'passing-editor-spa' | 'expected-product-failure'): Promise<StartedTarget> {
  const directory = path.join(qualificationTargetsRoot, target)
  const child = spawn(process.execPath, ['server.mjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = await waitForReady(child, /QUALIFICATION_READY http:\/\/127\.0\.0\.1:\d+/)
  const url = output.match(/QUALIFICATION_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
  if (!url) throw new Error(`Target did not publish a loopback URL: ${output}`)
  const response = await fetch(url)
  return { child, url, page: await response.text() }
}

async function startInterruptionTarget(): Promise<StartedTarget> {
  const directory = path.join(qualificationTargetsRoot, 'infrastructure-interruption')
  const child = spawn(process.execPath, ['worker.mjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = await waitForReady(child, /QUALIFICATION_READY http:\/\/127\.0\.0\.1:\d+/)
  const url = output.match(/QUALIFICATION_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
  if (!url) throw new Error(`Target did not publish a loopback URL: ${output}`)
  const response = await fetch(url)
  return { child, url, page: await response.text() }
}

async function stopTarget(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

async function seedTargetBaseline(input: {
  targetDirectory: string
  baseUrl: string
  planId: string
  expectedFailures?: ValidationArtifact['validations'][number]['expectedFailures']
  extension?: ReviewedExtensionFixture
}) {
  const projectId = `qualification-${input.planId}`
  const environment = await client.environment.create({ data: { name: 'local', baseUrl: input.baseUrl } })
  const fixture = await seedReviewedCapsuleLifecycleFixture({
    client,
    workspace,
    environmentId: environment.id,
    projectId,
    planId: input.planId,
    runId: `unused-${input.planId}`,
    omitTestRun: true,
    planLifecycle: 'validations_approved',
    targetCanonicalPath: input.targetDirectory,
    expectedFailures: input.expectedFailures,
    extension: input.extension,
  })
  await client.environment.update({ where: { id: environment.id }, data: { targetProjectId: projectId } })

  const capsuleService = new RuntimeCapsuleTestRunService(client, path.join(fixture.projectRoot, '.appraise'))
  const started = await startBaselineExecution(input.planId, {
    client,
    projectDirectory: fixture.projectRoot,
    idempotencyKey: `qualification-start-${input.planId}`,
    capsuleService,
  })
  return { fixture, projectId, started, capsuleService }
}

function editorStateExtension(input: {
  projectId: string
  mode: 'assert-saved' | 'hold-open'
}): ReviewedExtensionFixture {
  const fingerprint = reviewedCapsuleHashText(input.projectId)
  const source = `export async function reviewedCompiled(_inputs, context) {\n  await context.world.page.goto(context.baseUrl)\n}\n`
  const compiledSource =
    input.mode === 'assert-saved'
      ? `export async function reviewedCompiled(_inputs, context) {\n  await context.world.page.goto(context.baseUrl)\n  const state = await context.world.page.locator('[data-save-status]').getAttribute('data-save-status')\n  if (state !== 'saved') throw new Error('${expectedDraftFailure}')\n}\n`
      : `export async function reviewedCompiled(_inputs, context) {\n  await context.world.page.goto(context.baseUrl)\n  await new Promise(resolve => setTimeout(resolve, 5_000))\n}\n`
  const artifact = {
    schemaVersion: '1' as const,
    projectId: input.projectId,
    projectFingerprint: fingerprint,
    extension: {
      id: `qualification-editor-${input.mode}`,
      version: '1.0.0',
      title: 'Qualification editor target assertion',
      description: 'Executes against the owned loopback qualification target.',
      inputs: [],
      outputs: [],
    },
    requiredCapabilities: [],
    imports: [],
    source,
    compiledSource,
    sourceHash: reviewedCapsuleHashText(source),
    compiledHash: reviewedCapsuleHashText(compiledSource),
    cucumberModulePath: path.resolve(process.cwd(), 'node_modules/@cucumber/cucumber/lib/index.js'),
  }
  return { artifact, artifactHash: reviewedCapsuleHashValue(artifact) }
}

async function waitForTerminalRun(runId: string) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const run = await client.testRun.findUniqueOrThrow({ where: { runId } })
    if (['COMPLETED', 'CANCELLED'].includes(run.status)) return run
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Runtime capsule TestRun ${runId} did not terminalize.`)
}

async function waitForReport(runId: string) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const run = await client.testRun.findUniqueOrThrow({ where: { runId }, select: { reportPath: true } })
    if (
      run.reportPath &&
      (await fs
        .access(run.reportPath)
        .then(() => true)
        .catch(() => false))
    )
      return run
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Runtime capsule TestRun ${runId} did not persist its report.`)
}

async function reconcileObservedBaseline(input: { planId: string; projectDirectory: string }) {
  return reconcileBaselineExecution(input.planId, {
    client,
    projectDirectory: input.projectDirectory,
    appraiseRoot: path.join(input.projectDirectory, '.appraise'),
    idempotencyKey: `qualification-reconcile-${input.planId}`,
  })
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-qualification-target-baseline-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
  client = sqliteTestClient(databasePath)
})

afterEach(async () => {
  await client?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('target-bound qualification baselines', () => {
  it('accepts a passing editor baseline and starts implementation from immutable published state', async () => {
    const target = await startEditorTarget('passing-editor-spa')
    try {
      expect(target.page).toContain('data-save-status="saved"')
      const seeded = await seedTargetBaseline({
        targetDirectory: path.join(qualificationTargetsRoot, 'passing-editor-spa'),
        baseUrl: target.url,
        planId: 'qualification-passing-editor',
      })
      const attempt = seeded.started.baselineExecution.attempts[0]!
      const run = await waitForTerminalRun(attempt.testRunId)
      expect(run).toMatchObject({ result: 'PASSED', evidenceHealth: 'valid' })
      const reconciled = await reconcileObservedBaseline({
        planId: seeded.fixture.validation.planId,
        projectDirectory: seeded.fixture.projectRoot,
      })

      expect(reconciled.validation.baselineAttempts[0]).toMatchObject({ classification: 'unexpected_pass' })
      await justifyBaselineRegressionPass(
        {
          planId: seeded.fixture.validation.planId,
          attemptId: reconciled.validation.baselineAttempts[0]!.id,
          justification: 'Saved editor behavior is covered by this target qualification.',
        },
        {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-justify-passing-editor',
        },
      )
      await expect(
        acceptBaseline(seeded.fixture.validation.planId, {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-accept-passing-editor',
        }),
      ).resolves.toMatchObject({ plan: { lifecycle: 'baseline_accepted' } })
      await expect(
        startImplementation(seeded.fixture.validation.planId, {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-implementation-passing-editor',
        }),
      ).resolves.toMatchObject({ lifecycle: 'in_progress' })
    } finally {
      await stopTarget(target.child)
    }
  }, 30_000)

  it('records the draft editor assertion as an expected product failure, then acknowledges and accepts it', async () => {
    const target = await startEditorTarget('expected-product-failure')
    try {
      expect(target.page).toContain('data-save-status="draft"')
      const seeded = await seedTargetBaseline({
        targetDirectory: path.join(qualificationTargetsRoot, 'expected-product-failure'),
        baseUrl: target.url,
        planId: 'qualification-draft-editor',
        expectedFailures: [
          {
            browser: 'chromium',
            environment: 'local',
            signature: expectedDraftFailure,
            order: 0,
            lastPassingStepId: null,
          },
        ],
        extension: editorStateExtension({
          projectId: 'qualification-qualification-draft-editor',
          mode: 'assert-saved',
        }),
      })
      const runningAttempt = seeded.started.baselineExecution.attempts[0]!
      const run = await waitForTerminalRun(runningAttempt.testRunId)
      expect(run).toMatchObject({ result: 'FAILED', evidenceHealth: 'valid' })
      const reconciled = await reconcileObservedBaseline({
        planId: seeded.fixture.validation.planId,
        projectDirectory: seeded.fixture.projectRoot,
      })
      const attempt = reconciled.validation.baselineAttempts[0]!

      expect(attempt).toMatchObject({ classification: 'expected_product_failure' })
      await acknowledgeBaselineFailure(
        { planId: seeded.fixture.validation.planId, attemptId: attempt.id, acknowledgedBy: 'qualification-reviewer' },
        {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-acknowledge-draft-editor',
        },
      )
      await expect(
        acceptBaseline(seeded.fixture.validation.planId, {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-accept-draft-editor',
        }),
      ).resolves.toMatchObject({ plan: { lifecycle: 'baseline_accepted' } })
      await expect(
        startImplementation(seeded.fixture.validation.planId, {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-implementation-draft-editor',
        }),
      ).resolves.toMatchObject({ lifecycle: 'in_progress' })
    } finally {
      await stopTarget(target.child)
    }
  }, 30_000)

  it('recovers an interrupted real capsule worker as infrastructure evidence instead of an API target error', async () => {
    const target = await startInterruptionTarget()
    try {
      expect(target.page).toContain('data-qualification-target="interruption"')
      const seeded = await seedTargetBaseline({
        targetDirectory: path.join(qualificationTargetsRoot, 'infrastructure-interruption'),
        baseUrl: target.url,
        planId: 'qualification-interrupted-worker',
        extension: editorStateExtension({
          projectId: 'qualification-qualification-interrupted-worker',
          mode: 'hold-open',
        }),
      })
      const baselineAttempt = seeded.started.baselineExecution.attempts[0]!
      const run = await client.testRun.findUniqueOrThrow({
        where: { runId: baselineAttempt.testRunId },
        include: { runtimeCapsuleExecutionAttempt: true },
      })
      for (let attempt = 0; attempt < 50 && !processManager.has(run.runId); attempt += 1)
        await new Promise(resolve => setTimeout(resolve, 20))
      expect(processManager.has(run.runId)).toBe(true)

      // This is the supported restart recovery condition: a real capsule child remains active
      // while the in-memory registry is absent after a hub restart.
      processManager.unregister(run.runId)
      await expect(seeded.capsuleService.recoverInterrupted(run.id)).resolves.toBe(true)
      target.child.kill('SIGTERM')
      await once(target.child, 'exit')

      const terminal = await waitForTerminalRun(baselineAttempt.testRunId)
      expect(terminal).toMatchObject({ result: 'FAILED', evidenceHealth: 'infrastructure_failure' })
      await waitForReport(baselineAttempt.testRunId)
      await expect(
        client.runtimeCapsuleExecutionAttempt.findUniqueOrThrow({ where: { testRunId: run.id } }),
      ).resolves.toMatchObject({ state: 'INTERRUPTED' })
      const reconciled = await reconcileObservedBaseline({
        planId: seeded.fixture.validation.planId,
        projectDirectory: seeded.fixture.projectRoot,
      })

      expect(reconciled.plan.lifecycle).toBe('baseline_review')
      expect(reconciled.validation.baselineAttempts[0]).toMatchObject({ classification: 'infrastructure_failure' })
      await expect(
        acceptBaseline(seeded.fixture.validation.planId, {
          client,
          projectDirectory: seeded.fixture.projectRoot,
          idempotencyKey: 'qualification-accept-interrupted-worker',
        }),
      ).rejects.toThrow('baseline infrastructure failure')
    } finally {
      await stopTarget(target.child)
    }
  }, 30_000)
})
