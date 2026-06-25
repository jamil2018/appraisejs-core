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
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { validationNodeHash } from '@/lib/validation-review/approval'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { startCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'
import { readPlanEvents } from '@/services/coordinator/coordinator-service'
import { approvePlanRevision } from '@/services/plan-review/plan-review-service'

import {
  approveValidationFile,
  decideValidationNode,
  publishPreparedValidations,
  submitValidationReview,
} from './coordinator-validation-service'

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

function plan(planId: string): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle: 'awaiting_plan_review',
    goal: `Validate ${planId}`,
    description: `Prepare validation artifacts and file review evidence for ${planId}.`,
    tasks: [
      {
        id: 'first-task',
        title: 'First task',
        description: 'Generate reviewable validation evidence.',
        acceptanceCriteria: ['The validation gate is hash-bound.'],
        validationIntent: 'Run coordinator validation review tests.',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
}

function validation(planId: string, overrides: Partial<ValidationArtifact> = {}): ValidationArtifact {
  const base: ValidationArtifact = {
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
        gherkinPaths: ['automation/features/case-one.feature'],
        stepPaths: ['automation/steps/actions/case-one.step.ts'],
        executable: { path: 'automation/features/case-one.feature' },
        matrix: [{ browser: 'chromium', environment: 'local' }],
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
        path: 'src/product.ts',
        classification: 'production',
        rationale: 'Default production policy',
        status: 'modified',
        beforeHash: hashFileContent('old product'),
        contentHash: hashFileContent('new product'),
        patch: '--- a/src/product.ts\n+++ b/src/product.ts\n-old product\n+new product',
        declared: true,
      },
      {
        path: 'automation/features/case-one.feature',
        classification: 'test_only',
        rationale: 'Default test file policy',
        status: 'added',
        beforeHash: null,
        contentHash: hashFileContent('Feature: case one'),
        patch:
          '--- a/automation/features/case-one.feature\n+++ b/automation/features/case-one.feature\n+Feature: case one',
        declared: true,
      },
    ],
    manifestPaths: ['src/product.ts', 'automation/features/case-one.feature'],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
    ...overrides,
  }
  return base
}

async function writePlanArtifact(planId: string) {
  const plansRoot = path.join(workspace, 'appraise', 'plans')
  await fs.mkdir(plansRoot, { recursive: true })
  await fs.writeFile(path.join(plansRoot, `${planId}.yaml`), serializeYamlArtifact('plan', plan(planId)))
}

async function preparePlanForValidation(planId: string) {
  await writePlanArtifact(planId)
  await syncPlans({ projectDirectory: workspace, client })
  const repository = new PlanArtifactRepository(workspace)
  const expectedPlanHash = (await repository.read('plan', planId)).hash
  await approvePlanRevision({ planId, displayedRevision: 1, expectedPlanHash }, { projectDirectory: workspace, client })
  await startCoordinatorPlan(planId, { projectDirectory: workspace, client })
  return repository
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-validation-review-'))
  databasePath = path.join(workspace, 'validation-review.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensurePlanRuntimeSchema()
  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('validation preparation review gate', () => {
  it('publishes reviewable validation artifacts and blocks submission until current approvals exist', async () => {
    const planId = 'validation-gate'
    await preparePlanForValidation(planId)
    const artifact = validation(planId)

    await expect(
      publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client }),
    ).resolves.toEqual({
      validation: artifact,
      reviewUrl: `/plans/${planId}?review=validation`,
    })
    await expect(readPlanEvents({ planId, afterSequence: 1 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 2, type: 'validation_preparation_started' }),
      expect.objectContaining({ sequence: 3, type: 'validation_review_ready', payload: { revision: 1 } }),
    ])
    await expect(client.planProjection.findUniqueOrThrow({ where: { planId } })).resolves.toMatchObject({
      lifecycle: 'awaiting_validation_review',
    })

    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Required validation required-check is not approved'),
    })

    await decideValidationNode(
      { planId, validationId: 'required-check', decision: 'approved', decidedBy: 'reviewer' },
      { projectDirectory: workspace },
    )
    await approveValidationFile(
      {
        planId,
        path: 'src/product.ts',
        contentHash: artifact.files[0]!.contentHash!,
        approvedBy: 'reviewer',
      },
      { projectDirectory: workspace },
    )

    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).resolves.toMatchObject({
      plan: { lifecycle: 'validations_approved' },
    })
    await expect(readPlanEvents({ planId, afterSequence: 2 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 3, type: 'validation_review_ready' }),
      expect.objectContaining({ sequence: 4, type: 'validation_approved' }),
    ])
  })

  it('rejects manifest mismatches and invalidates approvals after generated evidence changes', async () => {
    const planId = 'validation-invalidation'
    const repository = await preparePlanForValidation(planId)
    const artifact = validation(planId)
    await publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client })

    await decideValidationNode(
      { planId, validationId: 'required-check', decision: 'approved', decidedBy: 'reviewer' },
      { projectDirectory: workspace },
    )
    await approveValidationFile(
      {
        planId,
        path: 'src/product.ts',
        contentHash: artifact.files[0]!.contentHash!,
        approvedBy: 'reviewer',
      },
      { projectDirectory: workspace },
    )

    const current = await repository.read('validation', planId)
    const changed = {
      ...artifact,
      validations: [
        {
          ...artifact.validations[0]!,
          stepPaths: ['automation/steps/actions/changed.step.ts'],
        },
      ],
      files: [
        {
          ...artifact.files[0]!,
          contentHash: hashFileContent('changed product'),
        },
      ],
      manifestPaths: ['src/product.ts', 'automation/features/case-one.feature', 'missing/review-evidence.ts'],
    }
    await repository.compareAndWrite('validation', planId, current.hash, serializeYamlArtifact('validation', changed))

    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining(
        `Required validation required-check is not approved for its current content hash.`,
      ),
    })
    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      message: expect.stringContaining('Manifest path has no changed-file evidence: missing/review-evidence.ts'),
    })
    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      message: expect.stringContaining('File src/product.ts requires approval for its current content hash.'),
    })

    await decideValidationNode(
      { planId, validationId: 'required-check', decision: 'approved', decidedBy: 'reviewer' },
      { projectDirectory: workspace },
    )
    const reparsed = parseYamlArtifact(
      'validation',
      (await repository.read('validation', planId)).content,
    ) as ValidationArtifact
    expect(reparsed.validationDecisions[0]).toMatchObject({
      validationId: 'required-check',
      contentHash: validationNodeHash(changed.validations[0]!),
    })
  })
})
