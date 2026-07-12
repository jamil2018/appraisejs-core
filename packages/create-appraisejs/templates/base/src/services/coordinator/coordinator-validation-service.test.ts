import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient, TemplateStepGroupType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
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
import { validationNodeHash } from '@/lib/validation-review/approval'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { startCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'
import { readPlanEvents } from '@/services/coordinator/coordinator-service'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import { approvePlanRevision } from '@/services/plan-review/plan-review-service'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'

import {
  approveValidationFile,
  decideValidationNode,
  publishPreparedValidations,
  submitValidationFeedback,
  submitValidationReview,
} from './coordinator-validation-service'
import {
  checkValidationDraft,
  createValidationDraft,
  publishValidationDraft,
  readValidationContext,
  readValidationDraft,
  upsertValidationFile,
  upsertValidationStepMetadata,
  upsertValidationTestCase,
} from './coordinator-validation-draft-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function ensurePlanRuntimeSchema() {
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
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

function appraiseArtifacts(testCaseId = 'case-one') {
  return {
    modules: [{ id: 'validation-module', name: 'Validation module' }],
    testSuites: [
      {
        id: 'validation-suite',
        name: 'Validation suite',
        moduleId: 'validation-module',
        testCaseIds: [testCaseId],
      },
    ],
    testCases: [
      {
        id: testCaseId,
        title: `Validate ${testCaseId}`,
        description: `AppraiseJS-authored test case for ${testCaseId}.`,
        steps: [
          {
            id: `${testCaseId}-step`,
            order: 0,
            label: 'Run validation step',
            gherkinStep: 'Given I run the validation step',
            templateStepName: 'Run step',
            parameters: [],
          },
        ],
      },
    ],
    locatorGroups: [{ id: 'validation-page', name: 'Validation page', route: '/', moduleId: 'validation-module' }],
    locators: [
      {
        id: 'validation-target',
        name: 'Validation target',
        value: '[data-testid="validation-target"]',
        locatorGroupId: 'validation-page',
      },
    ],
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
        appraiseArtifacts: appraiseArtifacts('case-one'),
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
    reusedStepPaths: ['automation/steps/actions/case-one.step.ts'],
    newStepPaths: [],
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
  await fs.mkdir(path.join(workspace, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'automation', 'features'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'automation', 'steps', 'actions'), { recursive: true })
  await fs.writeFile(path.join(workspace, 'src', 'product.ts'), 'new product')
  await fs.writeFile(path.join(workspace, 'src', 'secondary-product.ts'), 'new secondary')
  await fs.writeFile(path.join(workspace, 'automation', 'features', 'case-one.feature'), 'Feature: case one')
  await fs.writeFile(path.join(workspace, 'automation', 'features', 'case-two.feature'), 'Feature: case two')
  await fs.writeFile(path.join(workspace, 'automation', 'steps', 'actions', 'case-one.step.ts'), 'Given case one')
  await fs.writeFile(path.join(workspace, 'automation', 'steps', 'actions', 'case-two.step.ts'), 'Given case two')
  await fs.writeFile(
    path.join(workspace, 'automation', 'steps', 'actions', 'todo-only.step.ts'),
    'When todo custom step',
  )
  await fs.writeFile(
    path.join(workspace, 'automation', 'steps', 'actions', 'todo-workflow.steps.ts'),
    'When todo custom step',
  )
  await client.environment.upsert({
    where: { name: 'local' },
    update: { baseUrl: 'http://localhost:3000' },
    create: { name: 'local', baseUrl: 'http://localhost:3000' },
  })
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
  client = sqliteTestClient(databasePath)
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('validation preparation review gate', () => {
  it('creates an Appraise-owned draft and reports structured blockers before publish', async () => {
    const planId = 'validation-draft-blockers'
    await preparePlanForValidation(planId)

    const context = await readValidationContext(planId, { projectDirectory: workspace, client })
    expect(context.plan).toMatchObject({
      planId,
      revision: 1,
      lifecycle: 'preparing_validations',
    })
    expect(context.resources.environments).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local' })]))

    const created = await createValidationDraft(planId, { projectDirectory: workspace, client })
    expect(created.draft).toMatchObject({
      planId,
      revision: 1,
      status: 'draft',
      validations: [],
      files: [],
    })

    const checked = await checkValidationDraft(planId, { projectDirectory: workspace, client })
    expect(checked.draft.status).toBe('draft')
    expect(checked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-validation-nodes', path: ['validations'] }),
        expect.objectContaining({ code: 'missing-file-evidence', path: ['files'] }),
      ]),
    )
  })

  it('publishes a validation artifact generated from draft state', async () => {
    const planId = 'validation-draft-publish'
    await preparePlanForValidation(planId)
    const created = await createValidationDraft(planId, { projectDirectory: workspace, client })
    const templateStepGroup = await client.templateStepGroup.create({
      data: {
        name: 'Reusable validations',
        description: 'Shared validation steps.',
        type: TemplateStepGroupType.VALIDATION,
      },
    })
    const templateStep = await client.templateStep.create({
      data: {
        name: 'Run step',
        signature: 'Given I run the validation step',
        type: TemplateStepType.ASSERTION,
        icon: TemplateStepIcon.VALIDATION,
        templateStepGroupId: templateStepGroup.id,
      },
    })

    await upsertValidationTestCase(
      planId,
      {
        title: 'Case one',
        behavior: 'Validate case one through Appraise-owned draft state.',
        coveredTaskIds: ['first-task'],
        suiteRef: 'Validation suite',
        gherkinPath: 'automation/features/case-one.feature',
        steps: [
          {
            intent: 'Run validation step',
            gherkinText: 'Given I run the validation step',
            templateStepRef: templateStep.id,
          },
        ],
      },
      { projectDirectory: workspace, client },
    )
    await upsertValidationFile(
      planId,
      {
        path: 'automation/features/case-one.feature',
        classification: 'test_only',
        rationale: 'Reviewable feature evidence generated by validation preparation.',
        status: 'added',
        beforeHash: null,
        contentHash: hashFileContent('Feature: case one'),
        patch:
          '--- a/automation/features/case-one.feature\n+++ b/automation/features/case-one.feature\n+Feature: case one',
        declared: true,
      },
      { projectDirectory: workspace, client },
    )

    const checked = await checkValidationDraft(planId, { projectDirectory: workspace, client })
    expect(checked.blockers).toEqual([])
    expect(checked.draft.status).toBe('ready_for_review')

    const published = await publishValidationDraft(planId, created.draft.draftId, {
      projectDirectory: workspace,
      client,
    })
    expect(published).toMatchObject({
      accepted: true,
      published: true,
      validation: {
        lifecycle: 'awaiting_validation_review',
        validationArtifactPath: `appraise/plans/validations/${planId}.validation.yaml`,
        validationCount: 1,
        changedFileCount: 1,
      },
    })

    const repository = new PlanArtifactRepository(workspace)
    const validationArtifact = parseYamlArtifact(
      'validation',
      (await repository.read('validation', planId)).content,
    ) as ValidationArtifact
    expect(validationArtifact.validations[0]).toMatchObject({
      id: 'case-one',
      taskIds: ['first-task'],
      testCaseIds: ['case-one'],
      stepPaths: [],
    })
    expect(validationArtifact.reusedStepPaths).toEqual(['automation/steps/validations/reusable_validations.step.ts'])
    expect(validationArtifact.reusedTemplateStepRefs).toEqual([
      expect.objectContaining({
        id: templateStep.id,
        groupId: templateStepGroup.id,
        path: 'automation/steps/validations/reusable_validations.step.ts',
      }),
    ])
    expect(validationArtifact.runtimePreflight).toMatchObject({ status: 'passed' })
    expect(validationArtifact.runtimeProjections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'gherkin',
          declaredPath: 'automation/features/case-one.feature',
          materialization: 'generated',
        }),
        expect.objectContaining({
          role: 'step',
          declaredPath: 'automation/steps/validations/reusable_validations.step.ts',
          materialization: 'generated',
        }),
      ]),
    )
    await expect(readPlanEvents({ planId, afterSequence: 2 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 3, type: 'validation_review_ready', payload: { revision: 1 } }),
    ])
  })

  it('mutates draft step metadata without legacy publish fallback', async () => {
    const planId = 'validation-step-metadata'
    await preparePlanForValidation(planId)
    await createValidationDraft(planId, { projectDirectory: workspace, client })

    const result = await upsertValidationStepMetadata(
      planId,
      {
        reusedStepPaths: ['automation/steps/actions/case-one.step.ts'],
        newStepPaths: ['automation/steps/actions/todo-only.step.ts'],
        customStepJustifications: [
          {
            path: 'automation/steps/actions/todo-only.step.ts',
            missingCapability: 'No reusable todo workflow step exists.',
            whyLocatorsAndExistingStepsAreInsufficient: 'The workflow needs custom current-location setup.',
          },
        ],
      },
      { projectDirectory: workspace, client },
    )

    expect(result).toMatchObject({
      accepted: true,
      draftHash: expect.stringMatching(/^sha256:/),
      changedPaths: [],
      counts: expect.objectContaining({ validations: 0 }),
    })
    expect(result).not.toHaveProperty('draft')
    const current = await readValidationDraft(planId, { projectDirectory: workspace, client, responseMode: 'full' })
    expect(current.draft).toMatchObject({
      reusedStepPaths: ['automation/steps/actions/case-one.step.ts'],
      newStepPaths: ['automation/steps/actions/todo-only.step.ts'],
      customStepJustifications: [expect.objectContaining({ path: 'automation/steps/actions/todo-only.step.ts' })],
    })
  })

  it('publishes reviewable validation artifacts and blocks submission until current approvals exist', async () => {
    const planId = 'validation-gate'
    await preparePlanForValidation(planId)
    const artifact = validation(planId)

    await expect(
      publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      validation: {
        runtimePreflight: { status: 'passed' },
        runtimeProjections: expect.arrayContaining([
          expect.objectContaining({ role: 'gherkin', declaredPath: 'automation/features/case-one.feature' }),
          expect.objectContaining({ role: 'step', declaredPath: 'automation/steps/actions/case-one.step.ts' }),
        ]),
      },
      reviewUrl: `/plans/${planId}?review=validation`,
      lifecycle: 'awaiting_validation_review',
      revision: 1,
      validationArtifactPath: `appraise/plans/validations/${planId}.validation.yaml`,
      validationHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      validationCount: 1,
      changedFileCount: 2,
      manifestPaths: ['src/product.ts', 'automation/features/case-one.feature'],
      reusedStepPaths: ['automation/steps/actions/case-one.step.ts'],
      newStepPaths: [],
      nextReviewAction:
        'Open the validation review URL, inspect validation nodes and changed-file evidence, then approve or request changes.',
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
      { projectDirectory: workspace, client },
    )
    const projectionAfterDecision = await client.planProjection.findUniqueOrThrow({ where: { planId } })
    expect(JSON.parse(projectionAfterDecision.validationJson ?? '{}')).toMatchObject({
      validationDecisions: [expect.objectContaining({ validationId: 'required-check', decision: 'approved' })],
    })
    await approveValidationFile(
      {
        planId,
        path: 'src/product.ts',
        contentHash: artifact.files[0]!.contentHash!,
        approvedBy: 'reviewer',
      },
      { projectDirectory: workspace, client },
    )
    const projectionAfterFileApproval = await client.planProjection.findUniqueOrThrow({ where: { planId } })
    expect(JSON.parse(projectionAfterFileApproval.reviewJson ?? '{}')).toMatchObject({
      fileApprovals: [expect.objectContaining({ path: 'src/product.ts' })],
    })

    await expect(submitValidationReview(planId, { projectDirectory: workspace, client })).resolves.toMatchObject({
      plan: { lifecycle: 'validations_approved' },
    })
    await expect(readPlanEvents({ planId, afterSequence: 2 }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 3, type: 'validation_review_ready' }),
      expect.objectContaining({ sequence: 4, type: 'validations_approved' }),
    ])
  })

  it('requires gap justification before publishing new custom step paths', async () => {
    const planId = 'validation-custom-step-policy'
    await preparePlanForValidation(planId)
    const artifact = validation(planId, {
      newStepPaths: ['automation/steps/actions/todo-only.step.ts'],
      customStepJustifications: [],
    })

    await expect(
      publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining(
        'Custom step automation/steps/actions/todo-only.step.ts requires a registry/template-step reuse gap justification.',
      ),
    })
  })

  it('derives custom step policy from validation step paths even when newStepPaths is omitted', async () => {
    const planId = 'validation-derived-custom-step-policy'
    await preparePlanForValidation(planId)
    const artifact = validation(planId, {
      reusedStepPaths: ['automation/steps/actions/click.step.ts', 'automation/steps/actions/case-one.step.ts'],
      newStepPaths: undefined,
      customStepJustifications: undefined,
      validations: [
        {
          ...validation(planId).validations[0]!,
          stepPaths: ['automation/steps/actions/todo-workflow.steps.ts'],
        },
      ],
      manifestPaths: [
        'src/product.ts',
        'automation/features/case-one.feature',
        'automation/steps/actions/todo-workflow.steps.ts',
      ],
      files: [
        ...validation(planId).files,
        {
          path: 'automation/steps/actions/todo-workflow.steps.ts',
          classification: 'test_infrastructure',
          rationale: 'Custom todo workflow step',
          status: 'added',
          beforeHash: null,
          contentHash: hashFileContent('When todo custom step'),
          patch:
            '--- a/automation/steps/actions/todo-workflow.steps.ts\n+++ b/automation/steps/actions/todo-workflow.steps.ts',
          declared: true,
        },
      ],
    })

    await expect(
      publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining(
        'Custom step automation/steps/actions/todo-workflow.steps.ts requires a registry/template-step reuse gap justification.',
      ),
    })
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

  it('routes test-only validation feedback back to validation review while preserving unaffected approvals', async () => {
    const planId = 'validation-test-feedback'
    const repository = await preparePlanForValidation(planId)
    const artifact = validation(planId, {
      validations: [
        validation(planId).validations[0]!,
        {
          id: 'unaffected-check',
          taskIds: ['first-task'],
          required: true,
          testCaseIds: ['case-two'],
          appraiseArtifacts: appraiseArtifacts('case-two'),
          gherkinPaths: ['automation/features/case-two.feature'],
          stepPaths: ['automation/steps/actions/case-two.step.ts'],
          executable: { path: 'automation/features/case-two.feature' },
          matrix: [{ browser: 'chromium', environment: 'local' }],
          expectedFailures: [],
        },
      ],
      files: [
        validation(planId).files[0]!,
        validation(planId).files[1]!,
        {
          path: 'automation/features/case-two.feature',
          classification: 'test_only',
          rationale: 'Default test file policy',
          status: 'added',
          beforeHash: null,
          contentHash: hashFileContent('Feature: case two'),
          patch:
            '--- a/automation/features/case-two.feature\n+++ b/automation/features/case-two.feature\n+Feature: case two',
          declared: true,
        },
        {
          path: 'src/secondary-product.ts',
          classification: 'production',
          rationale: 'Default production policy',
          status: 'modified',
          beforeHash: hashFileContent('old secondary'),
          contentHash: hashFileContent('new secondary'),
          patch: '--- a/src/secondary-product.ts\n+++ b/src/secondary-product.ts\n-old secondary\n+new secondary',
          declared: true,
        },
      ],
      manifestPaths: [
        'src/product.ts',
        'automation/features/case-one.feature',
        'automation/features/case-two.feature',
        'src/secondary-product.ts',
      ],
      reusedStepPaths: ['automation/steps/actions/case-one.step.ts', 'automation/steps/actions/case-two.step.ts'],
      baselineAttempts: [
        {
          id: 'attempt-one',
          validationId: 'required-check',
          browser: 'chromium',
          environment: 'local',
          testRunId: 'run-one',
          status: 'completed',
          classification: 'expected_behavioral_failure',
          signatureHash: hashFileContent('known failure'),
          evidence: { logsUrl: 'logs', reportUrl: 'report', traceUrls: [], screenshotUrls: [] },
          createdAt: '2026-06-10T00:00:00Z',
          completedAt: '2026-06-10T00:01:00Z',
        },
        {
          id: 'attempt-two',
          validationId: 'unaffected-check',
          browser: 'chromium',
          environment: 'local',
          testRunId: 'run-two',
          status: 'completed',
          classification: 'expected_behavioral_failure',
          signatureHash: hashFileContent('known unaffected failure'),
          evidence: { logsUrl: 'logs-two', reportUrl: 'report-two', traceUrls: [], screenshotUrls: [] },
          createdAt: '2026-06-10T00:00:00Z',
          completedAt: '2026-06-10T00:01:00Z',
        },
      ],
      baselineAcknowledgements: [
        {
          attemptId: 'attempt-one',
          signatureHash: hashFileContent('known failure'),
          acknowledgedBy: 'reviewer',
          acknowledgedAt: '2026-06-10T00:02:00Z',
        },
        {
          attemptId: 'attempt-two',
          signatureHash: hashFileContent('known unaffected failure'),
          acknowledgedBy: 'reviewer',
          acknowledgedAt: '2026-06-10T00:02:00Z',
        },
      ],
      baselineDecision: 'accepted',
    })
    await publishPreparedValidations(planId, artifact, { projectDirectory: workspace, client })

    await decideValidationNode(
      { planId, validationId: 'required-check', decision: 'approved', decidedBy: 'reviewer' },
      { projectDirectory: workspace },
    )
    await decideValidationNode(
      { planId, validationId: 'unaffected-check', decision: 'approved', decidedBy: 'reviewer' },
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
    await approveValidationFile(
      {
        planId,
        path: 'src/secondary-product.ts',
        contentHash: artifact.files[3]!.contentHash!,
        approvedBy: 'reviewer',
      },
      { projectDirectory: workspace },
    )

    await submitValidationFeedback(
      {
        planId,
        scope: 'test_artifact',
        target: { type: 'validation', validationId: 'required-check' },
        body: 'Regenerate only the case-one Gherkin text.',
        actor: 'reviewer',
        affectedFilePaths: ['src/product.ts'],
      },
      { projectDirectory: workspace, client },
    )

    const planAfterFeedback = parseYamlArtifact('plan', (await repository.read('plan', planId)).content) as PlanArtifact
    const reviewAfterFeedback = parseYamlArtifact(
      'review',
      (await repository.read('review', planId)).content,
    ) as ReviewArtifact
    const validationAfterFeedback = parseYamlArtifact(
      'validation',
      (await repository.read('validation', planId)).content,
    ) as ValidationArtifact

    expect(planAfterFeedback.lifecycle).toBe('validation_changes_requested')
    expect(reviewAfterFeedback.threads).toEqual([
      expect.objectContaining({
        target: { type: 'validation', validationId: 'required-check' },
        blocking: true,
      }),
    ])
    expect(validationAfterFeedback.validationDecisions).toEqual([
      expect.objectContaining({ validationId: 'unaffected-check' }),
    ])
    expect(reviewAfterFeedback.fileApprovals).toEqual([expect.objectContaining({ path: 'src/secondary-product.ts' })])
    expect(validationAfterFeedback.baselineAttempts.map(attempt => attempt.id)).toEqual(['attempt-one', 'attempt-two'])
    expect(validationAfterFeedback.baselineAcknowledgements.map(acknowledgement => acknowledgement.attemptId)).toEqual([
      'attempt-one',
      'attempt-two',
    ])
    await expect(readPlanEvents({ planId, afterSequence: 3 }, client)).resolves.toEqual([
      expect.objectContaining({
        sequence: 4,
        type: 'validation_changes_requested',
        payload: expect.objectContaining({ scope: 'test_artifact' }),
      }),
    ])

    const revised = {
      ...validationAfterFeedback,
      validations: [
        {
          ...validationAfterFeedback.validations[0]!,
          gherkinPaths: ['automation/features/case-one-revised.feature'],
        },
        validationAfterFeedback.validations[1]!,
      ],
      files: validationAfterFeedback.files,
      manifestPaths: validationAfterFeedback.manifestPaths,
    }
    await fs.writeFile(
      path.join(workspace, 'automation', 'features', 'case-one-revised.feature'),
      'Feature: case one revised',
    )
    await expect(
      publishPreparedValidations(planId, revised, { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      validation: {
        validations: [
          expect.objectContaining({ gherkinPaths: ['automation/features/case-one-revised.feature'] }),
          expect.objectContaining({ id: 'unaffected-check' }),
        ],
        runtimePreflight: { status: 'passed' },
        runtimeProjections: expect.arrayContaining([
          expect.objectContaining({
            role: 'gherkin',
            declaredPath: 'automation/features/case-one-revised.feature',
            materialization: 'generated',
          }),
        ]),
      },
      reviewUrl: `/plans/${planId}?review=validation`,
      lifecycle: 'awaiting_validation_review',
      validationArtifactPath: `appraise/plans/validations/${planId}.validation.yaml`,
    })
  })

  it('routes product-scope validation feedback back to plan review and invalidates plan approval evidence', async () => {
    const planId = 'validation-product-feedback'
    const repository = await preparePlanForValidation(planId)
    const artifact = validation(planId, {
      baselineAttempts: [
        {
          id: 'attempt-one',
          validationId: 'required-check',
          browser: 'chromium',
          environment: 'local',
          testRunId: 'run-one',
          status: 'completed',
          classification: 'expected_behavioral_failure',
          signatureHash: hashFileContent('known failure'),
          evidence: { logsUrl: 'logs', reportUrl: 'report', traceUrls: [], screenshotUrls: [] },
          createdAt: '2026-06-10T00:00:00Z',
          completedAt: '2026-06-10T00:01:00Z',
        },
      ],
      baselineAcknowledgements: [
        {
          attemptId: 'attempt-one',
          signatureHash: hashFileContent('known failure'),
          acknowledgedBy: 'reviewer',
          acknowledgedAt: '2026-06-10T00:02:00Z',
        },
      ],
      baselineDecision: 'accepted',
    })
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

    await submitValidationFeedback(
      {
        planId,
        scope: 'product_scope',
        target: { type: 'validation', validationId: 'required-check' },
        body: 'The requested assertion changes approved checkout behavior.',
        actor: 'reviewer',
      },
      { projectDirectory: workspace, client },
    )

    const planAfterFeedback = parseYamlArtifact('plan', (await repository.read('plan', planId)).content) as PlanArtifact
    const reviewAfterFeedback = parseYamlArtifact(
      'review',
      (await repository.read('review', planId)).content,
    ) as ReviewArtifact
    const validationAfterFeedback = parseYamlArtifact(
      'validation',
      (await repository.read('validation', planId)).content,
    ) as ValidationArtifact

    expect(planAfterFeedback.lifecycle).toBe('changes_requested')
    expect(reviewAfterFeedback.planApprovals).toEqual([])
    expect(reviewAfterFeedback.fileApprovals).toEqual([])
    expect(reviewAfterFeedback.threads[0]).toMatchObject({
      target: { type: 'plan' },
      blocking: true,
    })
    expect(reviewAfterFeedback.threads[0]!.events[0]!.body).toContain('requires plan review')
    expect(validationAfterFeedback.validationDecisions).toEqual([])
    expect(validationAfterFeedback.baselineAttempts.map(attempt => attempt.id)).toEqual(['attempt-one'])
    expect(validationAfterFeedback.baselineAcknowledgements.map(acknowledgement => acknowledgement.attemptId)).toEqual([
      'attempt-one',
    ])
    expect(validationAfterFeedback.baselineDecision).toBe('pending')
    await expect(readPlanEvents({ planId, afterSequence: 3 }, client)).resolves.toEqual([
      expect.objectContaining({
        sequence: 4,
        type: 'plan_changes_requested',
        payload: expect.objectContaining({ scope: 'product_scope' }),
      }),
    ])
    await expect(startCoordinatorPlan(planId, { projectDirectory: workspace, client })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The current plan revision has not been approved.',
    })
  })
})
