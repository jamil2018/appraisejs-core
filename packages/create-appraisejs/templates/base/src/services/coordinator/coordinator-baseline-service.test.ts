import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { hashFailureSignatures } from '@/lib/baseline-execution/baseline'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { readPlanEvents } from '@/services/coordinator/coordinator-service'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import type { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'

import { projectValidationArtifacts } from './validation-runtime-projection-service'
import {
  acceptBaseline,
  baselineCapsulePreparationKey,
  acknowledgeBaselineFailure,
  justifyBaselineRegressionPass,
  mergeLegacyRuntimeIntoReviewedValidation,
  reconcileBaselineExecution,
  retryBaselineAfterRepair,
  startBaselineExecution,
  startImplementation,
} from './coordinator-baseline-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function ensurePlanRuntimeSchema() {
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
}

function plan(planId: string, lifecycle: PlanArtifact['lifecycle'] = 'validations_approved'): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle,
    goal: `Baseline ${planId}`,
    description: `Run and accept baseline evidence for ${planId}.`,
    tasks: [
      {
        id: 'first-task',
        title: 'First task',
        description: 'Implement behavior after accepted baselines.',
        acceptanceCriteria: ['Implementation is gated by accepted baseline evidence.'],
        validationIntent: 'Run coordinator baseline acceptance tests.',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
}

function appraiseArtifacts(testCaseId = 'case-one') {
  return {
    modules: [{ id: 'baseline-module', name: 'Baseline module' }],
    testSuites: [
      {
        id: 'baseline-suite',
        name: 'Baseline suite',
        moduleId: 'baseline-module',
        testCaseIds: [testCaseId],
      },
    ],
    testCases: [
      {
        id: testCaseId,
        title: `Baseline ${testCaseId}`,
        description: `AppraiseJS-authored baseline test case for ${testCaseId}.`,
        steps: [
          {
            id: `${testCaseId}-step`,
            order: 0,
            label: 'Run baseline step',
            gherkinStep: 'Given I run the baseline step',
            templateStepName: 'Run step',
            parameters: [],
          },
        ],
      },
    ],
    locatorGroups: [{ id: 'baseline-page', name: 'Baseline page', route: '/', moduleId: 'baseline-module' }],
    locators: [],
  }
}

function generatedFeatureContent(planId: string) {
  return [
    `@appraise_plan_${planId}`,
    'Feature: case-one',
    '',
    '  @appraise_validation_required-check @ts_baseline-suite @tc_case-one',
    '  Scenario: Baseline case-one',
    '    Given I run the baseline step',
    '',
  ].join('\n')
}

function validation(planId: string, overrides: Partial<ValidationArtifact> = {}): ValidationArtifact {
  const artifact: ValidationArtifact = {
    version: '1',
    planId,
    revision: 1,
    baseRevision: { gitCommit: null, snapshotHash: hashFileContent('snapshot'), reducedAssurance: true },
    classificationOverrides: [],
    validations: [
      {
        id: 'required-check',
        taskIds: ['first-task'],
        required: true,
        testCaseIds: ['case-one'],
        appraiseArtifacts: appraiseArtifacts('case-one'),
        gherkinPaths: ['automation/features/case-one.feature'],
        stepPaths: ['automation/steps/actions/case-one.step.ts'],
        executable: { path: 'automation/features/case-one.feature' },
        matrix: [
          { browser: 'chromium', environment: 'local' },
          { browser: 'firefox', environment: 'local' },
          { browser: 'webkit', environment: 'staging' },
        ],
        expectedFailures: [
          {
            browser: 'chromium',
            environment: 'local',
            signature: 'Expected first implementation run to fail before product work.',
            order: 0,
            lastPassingStepId: 'first-task',
          },
        ],
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [
      {
        path: 'automation/features/case-one.feature',
        classification: 'test_only',
        rationale: 'Baseline feature file',
        status: 'added',
        beforeHash: null,
        contentHash: hashFileContent(generatedFeatureContent(planId)),
        patch:
          '--- a/automation/features/case-one.feature\n+++ b/automation/features/case-one.feature\n+Feature: case one',
        declared: true,
      },
    ],
    manifestPaths: ['automation/features/case-one.feature'],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
    ...overrides,
  }
  return artifact
}

async function writeArtifacts(planId: string, lifecycle?: PlanArtifact['lifecycle']) {
  await fs.mkdir(path.join(workspace, 'appraise', 'plans', 'validations'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'automation', 'features'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'automation', 'steps', 'actions'), { recursive: true })
  await fs.writeFile(
    path.join(workspace, 'automation', 'features', 'case-one.feature'),
    generatedFeatureContent(planId),
  )
  await fs.writeFile(path.join(workspace, 'automation', 'steps', 'actions', 'case-one.step.ts'), 'Given case one')
  await fs.writeFile(
    path.join(workspace, 'appraise', 'plans', `${planId}.yaml`),
    serializeYamlArtifact('plan', plan(planId, lifecycle)),
  )
  await fs.writeFile(
    path.join(workspace, 'appraise', 'plans', 'validations', `${planId}.validation.yaml`),
    serializeYamlArtifact('validation', validation(planId)),
  )
  await client.environment.upsert({
    where: { name: 'local' },
    update: { baseUrl: 'http://localhost:3000' },
    create: { name: 'local', baseUrl: 'http://localhost:3000' },
  })
  await client.environment.upsert({
    where: { name: 'staging' },
    update: { baseUrl: 'https://staging.example.test' },
    create: { name: 'staging', baseUrl: 'https://staging.example.test' },
  })
  await projectValidationArtifacts({ planId, validation: validation(planId) }, client)
  await syncPlans({ projectDirectory: workspace, client })
}

async function readValidation(planId: string) {
  const { content } = await new PlanArtifactRepository(workspace).read('validation', planId)
  return parseYamlArtifact('validation', content) as ValidationArtifact
}

function recordSubmittedRun(
  submitted: Array<{ browser: string; environment: string; attemptOrdinal: number; testRunId: string }>,
  prefix = 'run',
) {
  return async (input: { browser: string; environment: string; attemptOrdinal: number }) => {
    const testRunId = `${prefix}-${input.browser}-${input.environment}-${input.attemptOrdinal}`
    submitted.push({
      browser: input.browser,
      environment: input.environment,
      attemptOrdinal: input.attemptOrdinal,
      testRunId,
    })
    return { testRunId }
  }
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-baseline-'))
  databasePath = path.join(workspace, 'baseline.db')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensurePlanRuntimeSchema()
  client = sqliteTestClient(databasePath)
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('baseline execution and implementation gate', () => {
  it('keeps a durable batch key stable while separating retries and matrix entries', () => {
    const base = {
      planId: 'plan',
      revision: 1,
      validationId: 'check',
      browser: 'chromium',
      environment: 'local',
      publishOperationId: 'operation',
      runtimeInputHash: `sha256:${'a'.repeat(64)}`,
    }
    expect(baselineCapsulePreparationKey({ ...base, attemptOrdinal: 0 })).toBe(
      baselineCapsulePreparationKey({ ...base, attemptOrdinal: 0 }),
    )
    expect(baselineCapsulePreparationKey({ ...base, attemptOrdinal: 1 })).not.toBe(
      baselineCapsulePreparationKey({ ...base, attemptOrdinal: 0 }),
    )
    expect(baselineCapsulePreparationKey({ ...base, browser: 'firefox', attemptOrdinal: 0 })).not.toBe(
      baselineCapsulePreparationKey({ ...base, attemptOrdinal: 0 }),
    )
    expect(
      baselineCapsulePreparationKey({ ...base, publishOperationId: 'republished-operation', attemptOrdinal: 0 }),
    ).not.toBe(baselineCapsulePreparationKey({ ...base, attemptOrdinal: 0 }))
  })

  it('preserves rewritten legacy runtime paths beside an unchanged reviewed v2 capsule node', () => {
    const reviewed = validation('mixed-runtime')
    const legacy = reviewed.validations[0]!
    const capsule = {
      ...legacy,
      id: 'capsule-check',
      astProvenance: {
        schemaVersion: '2' as const,
        astHash: `sha256:${'a'.repeat(64)}`,
        executionAuthority: 'phase2_review_only' as const,
        publishOperationId: 'operation-one',
        receiptHash: `sha256:${'b'.repeat(64)}`,
        runtimeInputHash: `sha256:${'c'.repeat(64)}`,
      },
    }
    const mixed = { ...reviewed, validations: [legacy, capsule] }
    const rewrittenLegacy = {
      ...legacy,
      gherkinPaths: ['/capsules/legacy/runtime.feature'],
      stepPaths: ['/capsules/legacy/runtime.steps.ts'],
    }
    const merged = mergeLegacyRuntimeIntoReviewedValidation(mixed, {
      ...reviewed,
      validations: [rewrittenLegacy],
      runtimeProjections: [
        {
          declaredPath: 'automation/features/case-one.feature',
          targetPath: 'automation/features/case-one.feature',
          runtimePath: '/capsules/legacy/runtime.feature',
          contentHash: `sha256:${'d'.repeat(64)}`,
          role: 'gherkin',
          materialization: 'copied',
        },
      ],
    })

    expect(merged.validations.find(item => item.id === legacy.id)).toMatchObject({
      gherkinPaths: ['/capsules/legacy/runtime.feature'],
      stepPaths: ['/capsules/legacy/runtime.steps.ts'],
    })
    expect(merged.validations.find(item => item.id === capsule.id)).toEqual(capsule)
    expect(merged.runtimeProjections).toEqual(
      expect.arrayContaining([expect.objectContaining({ runtimePath: '/capsules/legacy/runtime.feature' })]),
    )
  })

  it('routes an exact reviewed v2 AST baseline through a prepared capsule TestRun without target automation', async () => {
    const planId = 'capsule-baseline'
    await writeArtifacts(planId)
    const repository = new PlanArtifactRepository(workspace)
    const stored = await repository.read('validation', planId)
    const reviewed = parseYamlArtifact('validation', stored.content) as ValidationArtifact
    reviewed.validations[0]!.matrix = [{ browser: 'chromium', environment: 'local' }]
    reviewed.validations[0]!.astProvenance = {
      schemaVersion: '2',
      astHash: `sha256:${'a'.repeat(64)}`,
      executionAuthority: 'phase2_review_only',
      publishOperationId: 'publish-operation-one',
      receiptHash: `sha256:${'b'.repeat(64)}`,
      runtimeInputHash: `sha256:${'c'.repeat(64)}`,
    }
    await repository.compareAndWrite('validation', planId, stored.hash, serializeYamlArtifact('validation', reviewed))
    const targetProject = await client.targetProject.create({
      data: {
        canonicalPath: workspace,
        displayName: 'Capsule target',
        fingerprint: `sha256:${'d'.repeat(64)}`,
      },
    })
    await client.planProjection.update({ where: { planId }, data: { targetProjectId: targetProject.id } })
    await fs.rm(path.join(workspace, 'automation'), { recursive: true, force: true })
    const calls: Array<{ kind: string; input: Record<string, unknown> }> = []
    const capsuleService = {
      prepare: async (input: Record<string, unknown>) => {
        calls.push({ kind: 'prepare', input })
        return { id: 'test-run-db-id', runId: 'capsule-public-run' }
      },
      start: async (input: Record<string, unknown>) => {
        calls.push({ kind: 'start', input })
        return { testRunId: 'test-run-db-id', runId: 'capsule-public-run', attemptId: 'attempt-one' }
      },
    } as unknown as RuntimeCapsuleTestRunService

    const result = await startBaselineExecution(planId, { projectDirectory: workspace, client, capsuleService })

    expect(result.validation.baselineAttempts).toEqual([
      expect.objectContaining({ validationId: 'required-check', testRunId: 'capsule-public-run', status: 'running' }),
    ])
    expect(result.baselineExecution).toMatchObject({
      reused: false,
      reconcileLegal: true,
      nextAllowedAction: { tool: 'baseline_reconcile' },
      attempts: [expect.objectContaining({ testRunId: 'capsule-public-run', status: 'running' })],
    })
    expect(calls).toEqual([
      expect.objectContaining({
        kind: 'prepare',
        input: expect.objectContaining({
          operationId: 'publish-operation-one',
          validationId: 'required-check',
          browserEngine: 'CHROMIUM',
          preparationKey: expect.stringMatching(
            /^baseline:capsule-baseline:1:publish-operation-one:sha256:[a-f0-9]{64}:required-check:chromium:local:0$/,
          ),
        }),
      }),
      expect.objectContaining({
        kind: 'start',
        input: expect.objectContaining({
          testRunDbId: 'test-run-db-id',
          operationId: 'publish-operation-one',
          preparationKey: expect.stringMatching(
            /^baseline:capsule-baseline:1:publish-operation-one:sha256:[a-f0-9]{64}:required-check:chromium:local:0$/,
          ),
        }),
      }),
    ])
  })

  it('persists immutable attempt facts and append-only state observations', async () => {
    const planId = 'baseline-history'
    await writeArtifacts(planId)

    await startBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      now: new Date('2026-06-10T00:00:00.000Z'),
      submitRun: async () => ({ testRunId: 'history-run' }),
    })
    const stored = await client.baselineAttempt.findFirstOrThrow({
      where: { plan: { planId } },
      include: { events: true },
    })
    expect(stored).toMatchObject({
      validationId: 'required-check',
      validationRevision: 1,
      testRunId: 'history-run',
    })
    const repository = new PlanArtifactRepository(workspace)
    expect(stored.validationHash).toBe((await repository.read('validation', planId)).hash)
    expect(stored.events).toHaveLength(1)
    expect(stored.events[0]!.sequence).toBe(1)

    await reconcileBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      now: new Date('2026-06-10T00:01:00.000Z'),
      loadEvidence: async () => ({
        status: 'completed',
        result: 'failed',
        failureSignatures: ['expected failure'],
        completedStepIds: [],
      }),
    })
    const reconciled = await client.baselineAttempt.findUniqueOrThrow({
      where: { id: stored.id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
    expect(reconciled.createdAt).toEqual(stored.createdAt)
    expect(reconciled.evidenceJson).toEqual(stored.evidenceJson)
    expect(reconciled.events.map(event => event.kind)).toEqual(['state_observed', 'state_observed'])
    expect(reconciled.events.map(event => event.sequence)).toEqual([1, 2])
  })

  it('returns structured recovery metadata for an unsafe legacy TestRun name collision', async () => {
    const planId = 'baseline-name-conflict'
    await writeArtifacts(planId)
    const environment = await client.environment.findUniqueOrThrow({ where: { name: 'local' } })
    const existing = await client.testRun.create({
      data: {
        name: `Baseline ${planId} required-check chromium local attempt 1`,
        environmentId: environment.id,
      },
    })

    await expect(startBaselineExecution(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        conflictType: 'legacy_baseline_test_run_name',
        existingTestRun: { testRunId: existing.runId, planId: null, targetProjectId: null },
        requestedExecution: {
          planId,
          validationId: 'required-check',
          browser: 'chromium',
          environment: 'local',
          attemptOrdinal: 0,
        },
        reconcileLegal: false,
        nextAllowedAction: { tool: 'baseline_retry' },
      },
    })
  })

  it('runs every required baseline combination, records classifications, and unlocks implementation only after acceptance', async () => {
    const planId = 'baseline-gate'
    const submitted: Array<{ browser: string; environment: string; attemptOrdinal: number; testRunId: string }> = []
    await writeArtifacts(planId)

    await expect(startImplementation(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Accepted baselines are required before implementation.',
    })

    await expect(
      startBaselineExecution(planId, {
        projectDirectory: workspace,
        client,
        now: new Date('2026-06-10T00:00:00.000Z'),
        submitRun: recordSubmittedRun(submitted),
      }),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'baseline_running' },
      baselineExecution: { reused: false, reconcileLegal: true },
    })

    expect(submitted).toEqual([
      { browser: 'chromium', environment: 'local', attemptOrdinal: 0, testRunId: 'run-chromium-local-0' },
      { browser: 'firefox', environment: 'local', attemptOrdinal: 0, testRunId: 'run-firefox-local-0' },
      { browser: 'webkit', environment: 'staging', attemptOrdinal: 0, testRunId: 'run-webkit-staging-0' },
    ])
    await expect(readPlanEvents({ planId, afterSequence: 0 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'baseline_started', payload: { attempts: 3 } }),
    ])

    submitted.length = 0
    await expect(
      startBaselineExecution(planId, {
        projectDirectory: workspace,
        client,
        submitRun: recordSubmittedRun(submitted, 'unexpected'),
      }),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'baseline_running' },
      baselineExecution: {
        reused: true,
        reconcileLegal: true,
        attempts: expect.arrayContaining([expect.objectContaining({ testRunId: 'run-chromium-local-0' })]),
      },
    })
    expect(submitted).toEqual([])
    await expect(readPlanEvents({ planId, afterSequence: 0 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'baseline_started', payload: { attempts: 3 } }),
    ])

    await reconcileBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      now: new Date('2026-06-10T00:02:00.000Z'),
      loadEvidence: async testRunId => {
        if (testRunId === 'run-chromium-local-0') {
          return {
            status: 'completed',
            result: 'failed',
            failureSignatures: ['Expected first implementation run to fail before product work.'],
            completedStepIds: ['first-task'],
          }
        }
        if (testRunId === 'run-firefox-local-0') {
          return {
            status: 'completed',
            result: 'failed',
            failureSignatures: ['Existing report export failed'],
            completedStepIds: ['first-task'],
          }
        }
        return {
          status: 'completed',
          result: 'passed',
          failureSignatures: [],
          completedStepIds: ['first-task'],
        }
      },
    })

    const reviewed = await readValidation(planId)
    expect(reviewed.baselineAttempts).toEqual([
      expect.objectContaining({
        browser: 'chromium',
        environment: 'local',
        classification: 'expected_behavioral_failure',
        evidence: {
          logsUrl: '/api/test-runs/run-chromium-local-0/logs',
          reportUrl: '/test-runs/run-chromium-local-0',
          traceUrls: [],
          screenshotUrls: [],
        },
      }),
      expect.objectContaining({
        browser: 'firefox',
        environment: 'local',
        classification: 'pre_existing_unrelated_failure',
        signatureHash: hashFailureSignatures(['Existing report export failed']),
      }),
      expect.objectContaining({
        browser: 'webkit',
        environment: 'staging',
        classification: 'accepted_regression_pass',
        signatureHash: hashFailureSignatures([]),
      }),
    ])
    await expect(readPlanEvents({ planId, afterSequence: 1 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 2, type: 'baseline_review_ready' }),
    ])

    await expect(acceptBaseline(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('needs unrelated-failure acknowledgement'),
    })
    await expect(acceptBaseline(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      message: expect.stringContaining('needs regression-coverage justification'),
    })

    const unrelatedAttempt = reviewed.baselineAttempts.find(
      attempt => attempt.classification === 'pre_existing_unrelated_failure',
    )!
    const passingAttempt = reviewed.baselineAttempts.find(
      attempt => attempt.classification === 'accepted_regression_pass',
    )!
    await acknowledgeBaselineFailure(
      { planId, attemptId: unrelatedAttempt.id, acknowledgedBy: 'reviewer' },
      { projectDirectory: workspace, client, now: new Date('2026-06-10T00:03:00.000Z') },
    )
    await justifyBaselineRegressionPass(
      { planId, attemptId: passingAttempt.id, justification: 'The baseline already covers the new behavior.' },
      { projectDirectory: workspace, client },
    )

    await expect(acceptBaseline(planId, { projectDirectory: workspace, client })).resolves.toMatchObject({
      plan: { lifecycle: 'baseline_accepted' },
      validation: { baselineDecision: 'accepted' },
    })
    await expect(startImplementation(planId, { projectDirectory: workspace, client })).resolves.toMatchObject({
      lifecycle: 'in_progress',
    })
    await expect(readPlanEvents({ planId, afterSequence: 2 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 3, type: 'baseline_accepted' }),
      expect.objectContaining({ sequence: 4, type: 'implementation_started', payload: { revision: 1 } }),
    ])
  })

  it('rejects invalid baseline failures and stale validation files before implementation can start', async () => {
    const planId = 'invalid-baseline'
    await writeArtifacts(planId)

    await startBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      submitRun: async input => ({ testRunId: `run-${input.browser}-${input.environment}` }),
    })
    await reconcileBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      loadEvidence: async () => ({
        status: 'completed',
        result: 'failed',
        failureSignatures: ['Undefined step: Then checkout succeeds'],
        completedStepIds: [],
      }),
    })

    const harnessValidation = await readValidation(planId)
    expect(harnessValidation).toMatchObject({
      baselineDecision: 'changes-requested',
      baselineAttempts: expect.arrayContaining([
        expect.objectContaining({ classification: 'validation_harness_failure' }),
      ]),
    })
    const harnessPlan = parseYamlArtifact(
      'plan',
      (await new PlanArtifactRepository(workspace).read('plan', planId)).content,
    ) as PlanArtifact
    expect(harnessPlan.lifecycle).toBe('validation_changes_requested')
    await expect(acceptBaseline(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The plan is not awaiting baseline acceptance.',
    })

    const repository = new PlanArtifactRepository(workspace)
    const currentPlan = await repository.read('plan', planId)
    const currentValidation = await repository.read('validation', planId)
    await repository.compareAndWrite(
      'plan',
      planId,
      currentPlan.hash,
      serializeYamlArtifact('plan', plan(planId, 'baseline_accepted')),
    )
    await repository.compareAndWrite(
      'validation',
      planId,
      currentValidation.hash,
      serializeYamlArtifact('validation', { ...validation(planId), baselineDecision: 'accepted' }),
    )
    await fs.writeFile(path.join(workspace, 'automation', 'features', 'case-one.feature'), 'Feature: changed\n')

    await expect(startImplementation(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Validation files changed after approval or baseline execution'),
    })
  })

  // fallow-ignore-next-line code-duplication
  it('reopens invalid baseline review with an exact validation hash and preserves attempts', async () => {
    const planId = 'baseline-repair'
    await writeArtifacts(planId)
    await startBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      submitRun: async input => ({ testRunId: `run-${input.browser}-${input.environment}` }),
    })
    await reconcileBaselineExecution(planId, {
      projectDirectory: workspace,
      client,
      loadEvidence: async () => ({
        status: 'completed',
        result: 'failed',
        failureSignatures: ['Existing product failure'],
        completedStepIds: ['first-task'],
      }),
    })
    const repository = new PlanArtifactRepository(workspace)
    const stored = await repository.read('validation', planId)
    const current = parseYamlArtifact('validation', stored.content) as ValidationArtifact
    current.baselineAttempts[0] = {
      ...current.baselineAttempts[0],
      classification: 'validation_harness_failure',
    }
    const repairedStored = await repository.compareAndWrite(
      'validation',
      planId,
      stored.hash,
      serializeYamlArtifact('validation', current),
    )

    await expect(
      retryBaselineAfterRepair(
        {
          planId,
          reason: 'The generated selector matched zero scenarios.',
          expectedValidationHash: repairedStored.hash,
        },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'validation_changes_requested' },
      validation: {
        baselineDecision: 'changes-requested',
        baselineAttempts: expect.arrayContaining([
          expect.objectContaining({ testRunId: 'run-chromium-local', classification: 'validation_harness_failure' }),
        ]),
      },
    })
    await expect(readPlanEvents({ planId, afterSequence: 2 }, client)).resolves.toEqual([
      expect.objectContaining({
        type: 'validation_changes_requested',
        payload: expect.objectContaining({ preservedBaselineAttempts: true }),
      }),
    ])
  })

  it('checks validation files against a bound target project and reports structured drift', async () => {
    const planId = 'target-bound-baseline'
    const targetWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-target-'))
    await fs.writeFile(path.join(targetWorkspace, 'package.json'), '{}')
    await fs.mkdir(path.join(targetWorkspace, 'automation', 'features'), { recursive: true })
    await fs.mkdir(path.join(targetWorkspace, 'automation', 'steps', 'actions'), { recursive: true })
    await fs.writeFile(
      path.join(targetWorkspace, 'automation', 'features', 'case-one.feature'),
      generatedFeatureContent(planId),
    )
    await fs.writeFile(
      path.join(targetWorkspace, 'automation', 'steps', 'actions', 'case-one.step.ts'),
      'Given case one',
    )
    await writeArtifacts(planId)
    await fs.writeFile(path.join(workspace, 'automation', 'features', 'case-one.feature'), 'Feature: hub drift\n')
    const targetProject = await client.targetProject.create({
      data: {
        canonicalPath: targetWorkspace,
        displayName: 'External target',
        fingerprint: 'sha256:target-bound',
      },
    })
    await client.planProjection.update({ where: { planId }, data: { targetProjectId: targetProject.id } })

    await expect(
      startBaselineExecution(planId, {
        projectDirectory: workspace,
        client,
        submitRun: async input => ({ testRunId: `run-${input.browser}-${input.environment}` }),
      }),
    ).resolves.toMatchObject({ plan: { lifecycle: 'baseline_running' } })
    await expect(fs.readFile(path.join(workspace, 'automation', 'features', 'case-one.feature'), 'utf8')).resolves.toBe(
      'Feature: hub drift\n',
    )
    await expect(readValidation(planId)).resolves.toMatchObject({
      runtimeProjections: expect.arrayContaining([
        expect.objectContaining({
          declaredPath: 'automation/features/case-one.feature',
          runtimePath: path.join(targetWorkspace, 'automation', 'features', 'case-one.feature'),
        }),
        expect.objectContaining({
          declaredPath: 'automation/steps/actions/case-one.step.ts',
          runtimePath: path.join(targetWorkspace, 'automation', 'steps', 'actions', 'case-one.step.ts'),
        }),
      ]),
    })

    const driftPlanId = 'target-bound-drift'
    await writeArtifacts(driftPlanId)
    await client.planProjection.update({ where: { planId: driftPlanId }, data: { targetProjectId: targetProject.id } })
    await fs.writeFile(
      path.join(targetWorkspace, 'automation', 'features', 'case-one.feature'),
      'Feature: target drift\n',
    )

    await expect(
      startBaselineExecution(driftPlanId, {
        projectDirectory: workspace,
        client,
        submitRun: async input => ({ testRunId: `run-${input.browser}-${input.environment}` }),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        changedFiles: [
          expect.objectContaining({
            path: 'automation/features/case-one.feature',
            resolvedAbsolutePath: path.join(targetWorkspace, 'automation', 'features', 'case-one.feature'),
            expectedHash: hashFileContent(generatedFeatureContent(driftPlanId)),
            currentHash: hashFileContent('Feature: target drift\n'),
          }),
        ],
        targetProject: expect.objectContaining({ id: targetProject.id, canonicalPath: targetWorkspace }),
      },
    })

    await fs.rm(targetWorkspace, { recursive: true, force: true })
  })
})
