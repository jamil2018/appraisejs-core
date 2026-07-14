import { createServer, type Server } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prepareCleanCoordinatorPlanRuntimeTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { seedReviewedCapsuleLifecycleFixture } from '@/test/reviewed-capsule-lifecycle-fixture'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import {
  diagnoseTestRunEvidence,
  getTestRunLogsService,
  readTestRunEvidenceSummary,
} from '@/services/test-run/test-run-service'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { reconcileBaselineExecution, startBaselineExecution } from './coordinator-baseline-service'

describe('reviewed capsule coordinator lifecycle E2E', () => {
  let workspace: string
  let client: PrismaClient
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-coordinator-e2e-'))
    const databasePath = path.join(workspace, 'appraise.db')
    await fs.copyFile(path.join(process.cwd(), 'prisma/dev.db'), databasePath)
    await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
    client = sqliteTestClient(databasePath)
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<!doctype html><title>Appraise capsule</title><h1>Ready</h1>')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('HTTP fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
  }, 30_000)

  afterAll(async () => {
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await client?.$disconnect()
    await fs.rm(workspace, { recursive: true, force: true })
  }, 30_000)

  it('runs one exact reviewed case through the real capsule and reconciles full assurance', async () => {
    const environment = await client.environment.create({ data: { name: 'local', baseUrl } })
    const fixture = await seedReviewedCapsuleLifecycleFixture({
      client,
      workspace,
      environmentId: environment.id,
      projectId: 'coordinator-e2e-project',
      planId: 'coordinator-e2e-plan',
      runId: 'unused-coordinator-run',
      omitTestRun: true,
      planLifecycle: 'validations_approved',
    })
    await client.environment.update({
      where: { id: environment.id },
      data: { targetProjectId: 'coordinator-e2e-project' },
    })
    await fs.rm(path.join(fixture.projectRoot, 'automation'), { recursive: true, force: true })
    const capsuleService = new RuntimeCapsuleTestRunService(client, path.join(fixture.projectRoot, '.appraise'))
    let startError: unknown
    const originalStart = capsuleService.start.bind(capsuleService)
    capsuleService.start = async input =>
      originalStart(input).catch(error => {
        startError = error
        throw error
      })
    const started = await startBaselineExecution(fixture.validation.planId, {
      projectDirectory: fixture.projectRoot,
      client,
      capsuleService,
    })
    if (startError) throw startError
    expect(started.validation.baselineAttempts).toHaveLength(1)
    const publicRunId = started.validation.baselineAttempts[0]!.testRunId

    await vi.waitFor(
      async () => {
        await expect(client.testRun.findUniqueOrThrow({ where: { runId: publicRunId } })).resolves.toMatchObject({
          status: 'COMPLETED',
          result: 'PASSED',
          evidenceHealth: 'valid',
        })
      },
      { timeout: 30_000, interval: 250 },
    )
    const reconciled = await reconcileBaselineExecution(fixture.validation.planId, {
      projectDirectory: fixture.projectRoot,
      client,
    })
    expect(reconciled.validation.baselineAttempts[0]).toMatchObject({
      testRunId: publicRunId,
      status: 'completed',
      classification: 'unexpected_pass',
    })
    await expect(client.testRunTestCase.count({ where: { testRun: { runId: publicRunId } } })).resolves.toBe(1)
    await expect(client.report.count({ where: { testRun: { runId: publicRunId } } })).resolves.toBe(1)
    await expect(
      client.runtimeCapsuleExecutionAttempt.findFirstOrThrow({ where: { testRun: { runId: publicRunId } } }),
    ).resolves.toMatchObject({ state: 'COMPLETED' })
    await expect(
      readTestRunEvidenceSummary(
        publicRunId,
        'coordinator-e2e-project',
        client,
        path.join(fixture.projectRoot, '.appraise'),
      ),
    ).resolves.toMatchObject({
      executionRunId: publicRunId,
      testRunPageId: publicRunId,
      reportUrl: `/test-runs/${publicRunId}?project=coordinator-e2e-project`,
      logsUrl: `/api/test-runs/${publicRunId}/logs?targetProjectId=coordinator-e2e-project`,
      evidenceHealth: 'valid',
      completed: true,
    })
    await expect(
      diagnoseTestRunEvidence(
        publicRunId,
        'coordinator-e2e-project',
        client,
        path.join(fixture.projectRoot, '.appraise'),
      ),
    ).resolves.toMatchObject({
      kind: 'capsule',
      diagnostic: {
        run: { runId: publicRunId, evidenceHealth: 'valid', active: false },
        ownership: { targetProjectId: 'coordinator-e2e-project' },
        attempt: { state: 'COMPLETED', active: false },
      },
    })
    const storedRun = await client.testRun.findUniqueOrThrow({
      where: { runId: publicRunId },
      select: { logPath: true },
    })
    expect(storedRun.logPath).toBeTruthy()
    await expect(fs.access(storedRun.logPath!)).resolves.toBeUndefined()
    await expect(
      getTestRunLogsService(
        publicRunId,
        'coordinator-e2e-project',
        path.join(fixture.projectRoot, '.appraise'),
        client,
      ),
    ).resolves.toEqual(expect.any(Array))
    await expect(
      new TestRunArtifactAccessService(client, path.join(fixture.projectRoot, '.appraise')).readText({
        runId: publicRunId,
        kind: 'report',
        expectedTargetProjectId: 'coordinator-e2e-project',
      }),
    ).resolves.toContain('Open home')
    await expect(fs.access(path.join(fixture.projectRoot, 'automation'))).rejects.toThrow()
  }, 45_000)
})
