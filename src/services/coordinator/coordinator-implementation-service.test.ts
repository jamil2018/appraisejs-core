import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { appendPlanEvent, readPlanEvents, withPlanEventStreamLock } from '@/services/coordinator/coordinator-service'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'

import {
  applyBlockingFeedback,
  approveImplementationGroups,
  approveImplementationCompletion,
  controlImplementation,
  reachImplementationCheckpoint,
  recordImplementationValidation,
  reconcileImplementationValidation,
  reviewImplementationCompletion,
  startImplementationValidation,
  updateImplementationTask,
} from './coordinator-implementation-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function ensurePlanRuntimeSchema() {
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
}

function plan(planId: string, lifecycle: PlanArtifact['lifecycle'] = 'in_progress'): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle,
    goal: `Implement ${planId}`,
    description: `Coordinate checkpoints, feedback, and validation reruns for ${planId}.`,
    tasks: [
      {
        id: 'foundation',
        title: 'Foundation',
        description: 'Implement the shared foundation.',
        acceptanceCriteria: ['Foundation is complete.'],
        validationIntent: 'Run core validation.',
      },
      {
        id: 'api',
        title: 'API',
        description: 'Implement the dependent API.',
        acceptanceCriteria: ['API is complete.'],
        validationIntent: 'Run core validation.',
      },
      {
        id: 'docs',
        title: 'Docs',
        description: 'Implement independent documentation.',
        acceptanceCriteria: ['Docs are complete.'],
        validationIntent: 'Run docs validation.',
      },
    ],
    edges: [{ from: 'foundation', to: 'api', type: 'depends-on' }],
    implementationGroups: [
      { id: 'core', taskIds: ['foundation', 'api'] },
      { id: 'documentation', taskIds: ['docs'] },
    ],
  }
}

function appraiseArtifacts(testCaseId: string) {
  return {
    modules: [{ id: 'implementation-module', name: 'Implementation module' }],
    testSuites: [
      {
        id: `${testCaseId}-suite`,
        name: `${testCaseId} suite`,
        moduleId: 'implementation-module',
        testCaseIds: [testCaseId],
      },
    ],
    testCases: [
      {
        id: testCaseId,
        title: `Validate ${testCaseId}`,
        description: `AppraiseJS-authored implementation validation for ${testCaseId}.`,
        steps: [
          {
            id: `${testCaseId}-step`,
            order: 0,
            label: 'Run implementation validation step',
            gherkinStep: 'Given I run the implementation validation step',
            templateStepName: 'Run step',
            parameters: [],
          },
        ],
      },
    ],
    locatorGroups: [
      { id: `${testCaseId}-page`, name: `${testCaseId} page`, route: '/', moduleId: 'implementation-module' },
    ],
    locators: [],
  }
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
        id: 'core-validation',
        taskIds: ['foundation', 'api'],
        required: true,
        testCaseIds: ['case-core'],
        appraiseArtifacts: appraiseArtifacts('case-core'),
        gherkinPaths: ['automation/features/core.feature'],
        stepPaths: ['automation/steps/core.step.ts'],
        executable: { path: 'automation/features/core.feature' },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [],
      },
      {
        id: 'docs-validation',
        taskIds: ['docs'],
        required: true,
        testCaseIds: ['case-docs'],
        appraiseArtifacts: appraiseArtifacts('case-docs'),
        gherkinPaths: ['automation/features/docs.feature'],
        stepPaths: ['automation/steps/docs.step.ts'],
        executable: { path: 'automation/features/docs.feature' },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [],
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [],
    manifestPaths: [],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'accepted',
    implementation: {
      taskStates: {},
      approvedGroupIds: ['core', 'documentation'],
      pausedTaskIds: [],
      validationRuns: [],
      commits: [],
      evidenceProtected: true,
    },
    ...overrides,
  }
  return artifact
}

function review(planId: string): ReviewArtifact {
  return {
    version: '1',
    planId,
    threads: [],
    planApprovals: [],
    fileApprovals: [],
  }
}

async function writeArtifacts(
  planId: string,
  planOverrides: Partial<PlanArtifact> = {},
  validationOverrides: Partial<ValidationArtifact> = {},
  reviewOverrides: Partial<ReviewArtifact> = {},
) {
  await fs.mkdir(path.join(workspace, 'appraise', 'plans', 'validations'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'appraise', 'plans', 'reviews'), { recursive: true })
  await fs.writeFile(
    path.join(workspace, 'appraise', 'plans', `${planId}.yaml`),
    serializeYamlArtifact('plan', { ...plan(planId), ...planOverrides }),
  )
  await fs.writeFile(
    path.join(workspace, 'appraise', 'plans', 'validations', `${planId}.validation.yaml`),
    serializeYamlArtifact('validation', validation(planId, validationOverrides)),
  )
  await fs.writeFile(
    path.join(workspace, 'appraise', 'plans', 'reviews', `${planId}.review.yaml`),
    serializeYamlArtifact('review', { ...review(planId), ...reviewOverrides }),
  )
  await syncPlans({ projectDirectory: workspace, client })
}

async function readValidation(planId: string) {
  const repository = new PlanArtifactRepository(workspace)
  return parseYamlArtifact('validation', (await repository.read('validation', planId)).content) as ValidationArtifact
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-implementation-'))
  databasePath = path.join(workspace, 'implementation.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensurePlanRuntimeSchema()
  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('implementation coordinator checkpoints', () => {
  it('atomically verifies explicit tasks from satisfied managed evidence and replays idempotently', async () => {
    const planId = 'atomic-task-evidence'
    await writeArtifacts(planId, undefined, {
      implementation: {
        taskStates: { foundation: 'implemented' },
        approvedGroupIds: ['core', 'documentation'],
        pausedTaskIds: [],
        validationRuns: [
          {
            id: 'core-run',
            validationId: 'core-validation',
            taskIds: ['foundation', 'api'],
            required: true,
            status: 'passed',
            fresh: true,
            commitHash: 'commit-core',
            evidenceSource: 'managed',
            assurance: 'full',
            testRunId: 'managed-core-run',
            evidenceUrls: ['/test-runs/managed-core-run'],
            completedAt: '2026-06-11T00:00:00.000Z',
          },
        ],
        commits: [],
        reconciliationReceipts: [],
        evidenceProtected: true,
      },
    })

    const first = await reconcileImplementationValidation(
      { planId, runIds: [], verifyTaskIds: ['foundation'], idempotencyKey: 'verify-foundation-1' },
      { projectDirectory: workspace, client, now: new Date('2026-06-11T00:01:00.000Z') },
    )
    expect(first).toMatchObject({
      validation: { implementation: { taskStates: { foundation: 'verified' } } },
      receipt: { idempotencyKey: 'verify-foundation-1', verifiedTaskIds: ['foundation'] },
    })

    const replay = await reconcileImplementationValidation(
      { planId, runIds: [], verifyTaskIds: ['foundation'], idempotencyKey: 'verify-foundation-1' },
      { projectDirectory: workspace, client, now: new Date('2026-06-11T00:02:00.000Z') },
    )
    expect(replay.receipt).toEqual(first.receipt)
    await expect(readPlanEvents({ planId }, client)).resolves.toEqual([
      expect.objectContaining({ type: 'task_evidence_reconciled' }),
    ])
  })

  it('returns recovery guidance when checkpoint is called before implementation starts', async () => {
    const planId = 'checkpoint-before-implementation'
    await writeArtifacts(planId, { lifecycle: 'baseline_review' }, { baselineDecision: 'pending' })

    await expect(
      reachImplementationCheckpoint({ planId, type: 'before_group' }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      status: 'blocked_pre_implementation',
      lifecycle: 'baseline_review',
      terminal: false,
      mustContinue: true,
      nextAllowedAction: {
        action: 'accept_baseline',
        tool: 'baseline_accept',
      },
      nextRequiredAgentBehavior: 'accept_baseline',
    })
  })

  it('checkpoints runnable work, records provenance, pauses scoped feedback, and requires impacted reruns', async () => {
    const planId = 'checkpoint-flow'
    await writeArtifacts(planId)

    await expect(
      reachImplementationCheckpoint(
        { planId, type: 'before_group', taskIds: ['foundation', 'docs'] },
        { projectDirectory: workspace, client, now: new Date('2026-06-11T00:00:00.000Z') },
      ),
    ).resolves.toMatchObject({
      runnableTaskIds: ['foundation', 'docs'],
      checkpoint: { type: 'before_group', taskIds: ['foundation', 'docs'], queuedFeedbackCount: 0 },
    })

    await updateImplementationTask(
      { planId, taskId: 'foundation', status: 'in_progress' },
      { projectDirectory: workspace, client },
    )
    await updateImplementationTask(
      { planId, taskId: 'foundation', status: 'implemented', commitHash: 'commit-foundation' },
      { projectDirectory: workspace, client, now: new Date('2026-06-11T00:01:00.000Z') },
    )
    await expect(
      updateImplementationTask(
        { planId, taskId: 'foundation', status: 'implemented', commitHash: 'commit-foundation' },
        { projectDirectory: workspace, client, now: new Date('2026-06-11T00:01:30.000Z') },
      ),
    ).resolves.toMatchObject({
      commits: [
        {
          hash: 'commit-foundation',
          taskIds: ['foundation'],
          createdAt: '2026-06-11T00:01:00.000Z',
        },
      ],
    })
    await expect(
      reviewImplementationCompletion(planId, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      readiness: { ready: false, blockers: expect.arrayContaining([expect.stringContaining('foundation')]) },
      structuredBlockers: expect.arrayContaining([
        expect.objectContaining({
          nextMcpAction: 'implementation_task_update',
          requiredInput: expect.objectContaining({ taskId: '<task-id>', status: 'verified' }),
        }),
      ]),
    })
    await updateImplementationTask(
      { planId, taskId: 'foundation', status: 'verified' },
      { projectDirectory: workspace, client },
    )
    await updateImplementationTask(
      { planId, taskId: 'api', status: 'in_progress' },
      { projectDirectory: workspace, client },
    )
    await updateImplementationTask(
      { planId, taskId: 'api', status: 'implemented' },
      { projectDirectory: workspace, client },
    )

    await recordImplementationValidation(
      {
        planId,
        run: {
          id: 'run-core-old',
          validationId: 'core-validation',
          taskIds: ['foundation', 'api'],
          required: true,
          status: 'passed',
          fresh: true,
          commitHash: 'commit-old',
          evidenceUrls: ['/reports/run-core-old'],
          completedAt: '2026-06-11T00:02:00.000Z',
        },
      },
      { projectDirectory: workspace, client },
    )

    await expect(
      applyBlockingFeedback(
        { planId, affectedTaskIds: ['foundation'], confirmed: false },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toMatchObject({
      confirmationRequired: true,
      impact: {
        approvalsRequiringConfirmation: ['core'],
        independentTaskIds: ['docs'],
        impactedValidationIds: ['core-validation'],
      },
    })
    await expect(
      reachImplementationCheckpoint(
        { planId, type: 'after_task', taskIds: ['foundation'], queuedFeedbackCount: 1 },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toMatchObject({
      checkpoint: { type: 'after_task', queuedFeedbackCount: 1 },
    })

    await applyBlockingFeedback(
      { planId, affectedTaskIds: ['foundation'], confirmed: true },
      { projectDirectory: workspace, client },
    )
    const afterFeedback = await readValidation(planId)
    expect(afterFeedback.implementation).toMatchObject({
      approvedGroupIds: ['documentation'],
      pausedTaskIds: ['foundation', 'api'],
      taskStates: { foundation: 'pending', api: 'pending' },
      validationRuns: [expect.objectContaining({ id: 'run-core-old', fresh: false })],
    })
    await expect(
      reachImplementationCheckpoint({ planId, type: 'before_validation' }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({ runnableTaskIds: ['docs'] })

    await expect(readPlanEvents({ planId }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'implementation_checkpoint' }),
      expect.objectContaining({ sequence: 2, type: 'task_updated' }),
      expect.objectContaining({ sequence: 3, type: 'task_updated' }),
      expect.objectContaining({ sequence: 4, type: 'task_updated' }),
      expect.objectContaining({ sequence: 5, type: 'task_updated' }),
      expect.objectContaining({ sequence: 6, type: 'task_updated' }),
      expect.objectContaining({ sequence: 7, type: 'validation_failed' }),
      expect.objectContaining({ sequence: 8, type: 'implementation_checkpoint' }),
      expect.objectContaining({ sequence: 9, type: 'implementation_feedback_applied' }),
      expect.objectContaining({ sequence: 10, type: 'implementation_checkpoint' }),
    ])
  })

  it('approves implementation groups and reconciles Appraise-owned validation runs', async () => {
    const planId = 'implementation-validation-run'
    await writeArtifacts(planId, undefined, {
      implementation: {
        taskStates: { foundation: 'verified', api: 'verified', docs: 'verified' },
        approvedGroupIds: [],
        pausedTaskIds: [],
        validationRuns: [],
        commits: [
          {
            hash: 'commit-final',
            taskIds: ['foundation', 'api', 'docs'],
            createdAt: '2026-06-11T00:00:00.000Z',
          },
        ],
        evidenceProtected: true,
      },
    })

    await expect(
      approveImplementationGroups({ planId, groupIds: ['core'] }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      implementation: { approvedGroupIds: ['core'] },
    })

    const started = await startImplementationValidation(
      { planId, validationIds: ['core-validation'], commitHash: 'commit-final' },
      { projectDirectory: workspace, client, now: new Date('2026-06-11T00:01:00.000Z') },
    )
    expect(started).toMatchObject({
      plan: { lifecycle: 'validating' },
      runs: [expect.objectContaining({ validationId: 'core-validation', status: 'running' })],
      testRunInputs: [
        expect.objectContaining({
          planId,
          validationId: 'core-validation',
          implementationValidationRunId: expect.stringContaining('implementation-validation-core-validation'),
          browserEngine: 'CHROMIUM',
          featurePaths: ['automation/features/core.feature'],
          importPaths: ['automation/steps/core.step.ts'],
          tagExpression: '(@ts_case-core-suite and @tc_case-core)',
          expectedTestCases: [{ testCaseId: 'case-core', testSuiteId: 'case-core-suite' }],
        }),
      ],
    })

    const run = started.runs[0]!
    await expect(
      reconcileImplementationValidation(
        {
          planId,
          runIds: [run.id],
        },
        { projectDirectory: workspace, client, now: new Date('2026-06-11T00:02:00.000Z') },
      ),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'failed_validation' },
      readiness: {
        ready: false,
        blockers: [expect.stringContaining('core-validation'), expect.stringContaining('docs-validation')],
      },
    })
  })

  it('rejects unaccepted baselines and supports pause, resume, and cancel controls', async () => {
    const planId = 'control-flow'
    await writeArtifacts(planId, undefined, { baselineDecision: 'pending' })

    await expect(
      reachImplementationCheckpoint({ planId, type: 'before_task' }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      status: 'blocked_pre_implementation',
      baselineDecision: 'pending',
      nextRequiredAgentBehavior: 'wait_for_lifecycle_gate',
    })

    await writeArtifacts(planId)
    await expect(
      controlImplementation({ planId, action: 'pause' }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      lifecycle: 'paused',
    })
    await expect(
      controlImplementation({ planId, action: 'resume' }, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      lifecycle: 'in_progress',
    })
    await expect(
      controlImplementation(
        { planId, action: 'cancel', stopActiveRuns: true },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toMatchObject({ lifecycle: 'cancelled' })

    await expect(readPlanEvents({ planId }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'implementation_paused' }),
      expect.objectContaining({ sequence: 2, type: 'implementation_resumed' }),
      expect.objectContaining({ sequence: 3, type: 'plan_cancelled', payload: { stopActiveRuns: true } }),
    ])
  })

  it('requires fresh validation and current explicit sign-off evidence before completion', async () => {
    const planId = 'completion-flow'
    const completedAt = '2026-06-11T00:05:00.000Z'
    const implementation = {
      taskStates: { foundation: 'verified', api: 'verified', docs: 'verified' },
      approvedGroupIds: ['core', 'documentation'],
      pausedTaskIds: [],
      validationRuns: [
        {
          id: 'run-core-final',
          validationId: 'core-validation',
          taskIds: ['foundation', 'api'],
          required: true,
          status: 'passed',
          fresh: true,
          commitHash: 'commit-final',
          evidenceSource: 'managed',
          assurance: 'full',
          testRunId: 'test-run-core-final',
          evidenceUrls: ['/reports/run-core-final', '/traces/run-core-final.zip', '/screenshots/run-core-final.png'],
          completedAt,
        },
        {
          id: 'run-docs-final',
          validationId: 'docs-validation',
          taskIds: ['docs'],
          required: true,
          status: 'passed',
          fresh: true,
          commitHash: 'commit-final',
          evidenceSource: 'managed',
          assurance: 'full',
          testRunId: 'test-run-docs-final',
          evidenceUrls: ['/reports/run-docs-final'],
          completedAt,
        },
        {
          id: 'run-optional-final',
          validationId: 'optional-validation',
          taskIds: ['docs'],
          required: false,
          status: 'failed',
          fresh: true,
          commitHash: 'commit-final',
          evidenceSource: 'manual',
          assurance: 'reduced',
          evidenceUrls: ['/reports/run-optional-final'],
          failureSignatureHash: hashFileContent('known optional failure'),
          acknowledgedAt: completedAt,
          completedAt,
        },
      ],
      commits: [{ hash: 'commit-final', taskIds: ['foundation', 'api', 'docs'], createdAt: completedAt }],
      evidenceProtected: true,
    } satisfies NonNullable<ValidationArtifact['implementation']>
    const nonBlockingRemark = {
      id: 'remark-follow-up',
      target: { type: 'task' as const, taskId: 'docs' },
      blocking: false,
      events: [
        {
          id: 'remark-event',
          action: 'created' as const,
          actor: 'reviewer',
          createdAt: completedAt,
          body: 'Follow up after completion.',
        },
      ],
    }

    await writeArtifacts(planId, { lifecycle: 'in_progress' }, { implementation }, { threads: [nonBlockingRemark] })
    const beforeValidationReview = await reviewImplementationCompletion(planId, { projectDirectory: workspace, client })
    expect(beforeValidationReview).toMatchObject({
      readiness: { ready: true },
      optionalFailures: [expect.objectContaining({ id: 'run-optional-final' })],
      acknowledgedFailures: [expect.objectContaining({ id: 'run-optional-final' })],
      nonBlockingRemarks: [expect.objectContaining({ id: 'remark-follow-up' })],
    })
    expect(beforeValidationReview.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    await expect(
      approveImplementationCompletion(
        { planId, approvedBy: 'user', contentHash: beforeValidationReview.evidenceHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Passing validations are required before completion.',
    })

    await writeArtifacts(
      planId,
      { lifecycle: 'validation_passed' },
      { implementation },
      { threads: [nonBlockingRemark] },
    )
    const completionReview = await reviewImplementationCompletion(planId, { projectDirectory: workspace, client })
    expect(completionReview.evidenceHash).not.toBe(beforeValidationReview.evidenceHash)
    await expect(
      approveImplementationCompletion(
        { planId, approvedBy: 'user', contentHash: beforeValidationReview.evidenceHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Completion approval must reference the current completion evidence hash.',
    })

    let releaseLock!: () => void
    let lockAcquired!: () => void
    const acquired = new Promise<void>(resolve => {
      lockAcquired = resolve
    })
    const held = withPlanEventStreamLock(
      planId,
      async () => {
        lockAcquired()
        await new Promise<void>(resolve => {
          releaseLock = resolve
        })
      },
      client,
    )
    await acquired
    const newerEvent = appendPlanEvent(
      { planId, type: 'implementation_checkpoint_reached', payload: { type: 'before_completion' } },
      client,
    )
    const racedApproval = approveImplementationCompletion(
      { planId, approvedBy: 'user', contentHash: completionReview.evidenceHash },
      { projectDirectory: workspace, client },
    )
    releaseLock()
    await held
    await newerEvent
    await expect(racedApproval).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        staleEvidenceHash: completionReview.evidenceHash,
        currentEvidenceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        currentReceipt: {
          eventSequence: 1,
          evidenceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          plan: { lifecycle: 'validation_passed' },
        },
      },
    })
    const currentCompletionReview = await reviewImplementationCompletion(planId, {
      projectDirectory: workspace,
      client,
    })
    expect(currentCompletionReview.evidenceHash).not.toBe(completionReview.evidenceHash)

    await expect(
      approveImplementationCompletion(
        { planId, approvedBy: 'user', contentHash: currentCompletionReview.evidenceHash },
        { projectDirectory: workspace, client, now: new Date('2026-06-11T00:06:00.000Z') },
      ),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'completed' },
      review: {
        finalSignOff: {
          contentHash: currentCompletionReview.evidenceHash,
          approvedBy: 'user',
          relevantHashes: {
            plan: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            validation: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            review: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          },
        },
      },
      validation: { implementation: { evidenceProtected: false } },
    })
    await expect(readPlanEvents({ planId }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'implementation_checkpoint_reached' }),
      expect.objectContaining({ sequence: 2, type: 'plan_completed', payload: { approvedBy: 'user' } }),
    ])
  })
})
