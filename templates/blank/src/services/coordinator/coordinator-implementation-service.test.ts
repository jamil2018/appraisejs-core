import { execFileSync } from 'node:child_process'
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
import { readPlanEvents } from '@/services/coordinator/coordinator-service'

import {
  applyBlockingFeedback,
  controlImplementation,
  reachImplementationCheckpoint,
  recordImplementationValidation,
  reviewImplementationCompletion,
  updateImplementationTask,
} from './coordinator-implementation-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function applyMigration(name: string) {
  execFileSync('sqlite3', [databasePath], {
    input: await fs.readFile(path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql')),
  })
}

async function ensurePlanRuntimeSchema() {
  const projectionTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='PlanProjection';",
  ])
    .toString()
    .trim()
  if (!projectionTable) await applyMigration('20260609002500_add_plan_projection_and_sync')

  const descriptionColumn = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM pragma_table_info('PlanProjection') WHERE name='description';",
  ])
    .toString()
    .trim()
  if (!descriptionColumn) await applyMigration('20260613015000_add_plan_description')

  const eventTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='PlanEvent';",
  ])
    .toString()
    .trim()
  if (!eventTable) await applyMigration('20260609090000_add_plan_review_runtime')

  const identityTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='AppraiseProjectIdentity';",
  ])
    .toString()
    .trim()
  if (!identityTable) await applyMigration('20260609160000_add_coordinator_events_api_mcp')
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
    serializeYamlArtifact('review', review(planId)),
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
    await expect(reviewImplementationCompletion(planId, { projectDirectory: workspace })).resolves.toMatchObject({
      readiness: { ready: false, blockers: expect.arrayContaining([expect.stringContaining('foundation')]) },
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

  it('rejects unaccepted baselines and supports pause, resume, and cancel controls', async () => {
    const planId = 'control-flow'
    await writeArtifacts(planId, undefined, { baselineDecision: 'pending' })

    await expect(
      reachImplementationCheckpoint({ planId, type: 'before_task' }, { projectDirectory: workspace, client }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Accepted baselines are required before implementation.',
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
})
