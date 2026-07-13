import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'
import { basicValidationAstSubmission, sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import { parseYamlArtifact, serializeYamlArtifact, type ValidationArtifact } from '@/lib/plan-contract'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import {
  checkValidationAstForPlan,
  compileValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionReviewsForPlan,
} from './validation-ast-operation-service'
import { decideValidationNode, submitValidationReview } from './coordinator-validation-service'
import { registerProjectResourceOwnership } from '@/services/project-resource/project-resource-ownership-service'

const planHash = `sha256:${'a'.repeat(64)}`
const contractHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const submission = (taskId = 'task-one') => basicValidationAstSubmission(planHash, taskId)

const meditationSubmission = () => ({
  expectedPlanHash: planHash,
  authoringProfile: { id: 'simple-happy-path', version: '1' },
  ast: {
    schemaVersion: '1',
    id: 'meditation-happy-path',
    title: 'Complete a meditation',
    purpose: 'Verify a meditation completes and its result persists.',
    coversTaskIds: ['task-one'],
    matrix: [{ browser: 'chromium', environmentId: 'local' }],
    scenarios: [
      {
        id: 'complete-meditation',
        title: 'Complete and persist a meditation',
        steps: [
          {
            id: 'open-meditation',
            keyword: 'Given',
            description: 'the meditation page is open',
            action: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/meditate' } },
          },
          {
            id: 'start-meditation',
            keyword: 'When',
            description: 'the user starts meditation',
            action: {
              id: 'browser.mouse.click',
              version: '1',
              inputs: { target: { ref: 'locator', id: 'locator_start-button', version: '1' } },
            },
          },
          {
            id: 'confirm-accessibility',
            keyword: 'Then',
            description: 'the completion is accessible',
            action: {
              id: 'browser.assertions.accessible',
              version: '1',
              inputs: { target: { ref: 'locator', id: 'locator_completion', version: '1' } },
            },
          },
          {
            id: 'confirm-persistence',
            keyword: 'Then',
            description: 'the persisted completion is visible',
            action: {
              id: 'browser.assertions.persisted',
              version: '1',
              inputs: { target: { ref: 'locator', id: 'locator_completion', version: '1' } },
            },
          },
        ],
      },
    ],
    qualityConcerns: ['accessibility', 'persistence'],
    coverageArgument: {
      mappings: [
        {
          kind: 'task',
          targetId: 'task-one',
          scenarioIds: ['complete-meditation'],
          stimulusStepIds: ['start-meditation'],
          observationStepIds: ['confirm-accessibility', 'confirm-persistence'],
          rationale: 'Starting meditation is followed by observable accessibility and persistence assertions.',
          state: 'covered',
        },
        {
          kind: 'quality-concern',
          targetId: 'accessibility',
          scenarioIds: ['complete-meditation'],
          stimulusStepIds: ['start-meditation'],
          observationStepIds: ['confirm-accessibility'],
          rationale: 'The registered accessibility assertion observes the completed result.',
          state: 'covered',
        },
        {
          kind: 'quality-concern',
          targetId: 'persistence',
          scenarioIds: ['complete-meditation'],
          stimulusStepIds: ['start-meditation'],
          observationStepIds: ['confirm-persistence'],
          rationale: 'The registered persistence assertion observes the completed result.',
          state: 'covered',
        },
      ],
    },
    customExtensions: [],
  },
  customExtensionProposals: [],
})

let workspace: string
let client: PrismaClient
// fallow-ignore-next-line code-duplication -- isolated real-SQLite harness
beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-ast-operation-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"ast-operation-test"}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  client = sqliteTestClient(databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
  const environment = await client.environment.upsert({
    where: { name: 'local' },
    update: {},
    create: { name: 'local', baseUrl: 'http://localhost' },
  })
  const target = await client.targetProject.create({
    data: { canonicalPath: workspace, displayName: 'Target', fingerprint: `sha256:${'b'.repeat(64)}` },
  })
  const repository = new PlanArtifactRepository(workspace)
  await client.module.create({
    data: {
      id: 'meditation-module',
      name: 'Meditation',
      locatorGroups: {
        create: {
          id: 'meditation-page',
          name: 'Meditation page',
          route: '/meditate',
          locators: {
            create: [
              { id: 'start-button', name: 'Start button', value: '[data-testid="start"]' },
              { id: 'completion', name: 'Completion message', value: '[data-testid="completion"]' },
            ],
          },
        },
      },
    },
  })
  for (const [entityType, entityId] of [
    ['environment', environment.id],
    ['module', 'meditation-module'],
    ['locator-group', 'meditation-page'],
    ['locator', 'start-button'],
    ['locator', 'completion'],
  ] as const)
    await registerProjectResourceOwnership(
      { targetProjectId: target.id, entityType, entityId, origin: 'test-fixture', content: { entityId } },
      client,
    )
  for (const planId of ['plan-one', 'plan-two']) {
    await client.planProjection.create({
      data: {
        planId,
        revision: 1,
        lifecycle: 'preparing_validations',
        goal: 'Test',
        description: 'Test AST',
        sourceHash: planHash,
        planPath: `${planId}.yaml`,
        lastValidProjectedAt: new Date(),
        targetProjectId: target.id,
        tasks: {
          create: {
            taskId: 'task-one',
            title: 'Task',
            description: 'Task',
            acceptanceJson: '[]',
            validationIntent: 'Validate',
            position: 0,
          },
        },
      },
    })
    await repository.create(
      'plan',
      planId,
      serializeYamlArtifact('plan', {
        version: '1',
        planId,
        revision: 1,
        lifecycle: 'preparing_validations',
        goal: 'Test',
        description: 'Test AST',
        tasks: [
          {
            id: 'task-one',
            title: 'Task',
            description: 'Task',
            acceptanceCriteria: ['Done'],
            validationIntent: 'Validate',
          },
        ],
        edges: [],
        implementationGroups: [],
      }),
    )
    await repository.create(
      'review',
      planId,
      serializeYamlArtifact('review', {
        version: '1',
        planId,
        planApprovals: [],
        threads: [],
        fileApprovals: [],
      }),
    )
  }
})
afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('Validation AST SQLite preview to compile', () => {
  it('publishes the simple meditation happy path to one exact first review', async () => {
    const proposal = meditationSubmission()
    const checked = await checkValidationAstForPlan('plan-one', proposal, client)
    expect(checked).toMatchObject({ valid: true, blockers: [] })
    const preview = await previewValidationAstForPlan('plan-one', proposal, client)
    expect(preview).toMatchObject({
      valid: true,
      authoringProfile: { id: 'simple-happy-path', version: '1' },
    })
    expect(preview.actions).toHaveLength(4)
    expect(preview.locators).toHaveLength(2)
    expect(preview.customExtensions.length).toBeLessThanOrEqual(1)
    const projectedModule = preview.canonicalProjection.validationNode.appraiseArtifacts.modules[0]!
    if (projectedModule.id !== 'meditation-module') {
      await client.module.create({ data: projectedModule })
      await client.locatorGroup.update({
        where: { id: 'meditation-page' },
        data: { moduleId: projectedModule.id },
      })
      await client.module.delete({ where: { id: 'meditation-module' } })
    }

    const published = await compileValidationAstForPlan(
      {
        planId: 'plan-one',
        submission: proposal,
        expectedReceiptHash: preview.receiptHash,
        projectDirectory: workspace,
      },
      client,
    )
    expect(published).toMatchObject({ phase: 'review_ready', receiptHash: preview.receiptHash })
    expect(published).toMatchObject({
      id: preview.canonicalProjection.validationNode.astProvenance?.publishOperationId,
      runtimeInputHash: preview.canonicalProjection.validationNode.astProvenance?.runtimeInputHash,
    })
    expect(contractHash(JSON.parse(published.runtimeInputJson!))).toBe(published.runtimeInputHash)
    expect(await client.validationAstPublishOperation.count({ where: { planId: 'plan-one' } })).toBe(1)
    expect(published.projectionHash).toBe(preview.canonicalProjection.projectionHash)
    expect(published.projectionHash).toBe(
      contractHash({
        validationNode: preview.canonicalProjection.validationNode,
        gherkin: preview.canonicalProjection.gherkin,
      }),
    )

    const repository = new PlanArtifactRepository(workspace)
    const validationArtifact = await repository.read('validation', 'plan-one')
    const exactReview = parseYamlArtifact('validation', validationArtifact.content) as ValidationArtifact
    expect(exactReview.validations).toEqual([preview.canonicalProjection.validationNode])
    expect(validationArtifact.hash).toBe(published.validationHash)
    const reviewReady = await client.planEvent.findUniqueOrThrow({
      where: {
        publishOperationId_type: { publishOperationId: published.id, type: 'validation_review_ready' },
      },
    })
    expect(JSON.parse(reviewReady.payloadJson!)).toMatchObject({
      operationId: published.id,
      receiptHash: preview.receiptHash,
      validationHash: hashFileContent(validationArtifact.content),
      extensionReviewHashes: [],
    })
    const firstDecision = await decideValidationNode(
      {
        planId: 'plan-one',
        validationId: 'meditation-happy-path',
        decision: 'approved',
        decidedBy: 'reviewer',
        operationHash: published.operationHash,
        extensionArtifactHashes: [],
      },
      { client, projectDirectory: workspace },
    )
    await new Promise(resolve => setTimeout(resolve, 5))
    const retriedDecision = await decideValidationNode(
      {
        planId: 'plan-one',
        validationId: 'meditation-happy-path',
        decision: 'approved',
        decidedBy: 'different-reviewer-on-retry',
        operationHash: published.operationHash,
        extensionArtifactHashes: [],
      },
      { client, projectDirectory: workspace },
    )
    expect(retriedDecision).toEqual(firstDecision)
    await expect(
      decideValidationNode(
        {
          planId: 'plan-one',
          validationId: 'meditation-happy-path',
          decision: 'approved',
          decidedBy: 'reviewer',
          operationHash: `sha256:${'0'.repeat(64)}`,
          extensionArtifactHashes: [],
        },
        { client, projectDirectory: workspace },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await client.planEvent.count({
        where: { publishOperationId: published.id, validationId: 'meditation-happy-path' },
      }),
    ).toBe(1)
    const decisionEvent = await client.planEvent.findUniqueOrThrow({
      where: {
        publishOperationId_validationId: {
          publishOperationId: published.id,
          validationId: 'meditation-happy-path',
        },
      },
    })
    expect(JSON.parse(decisionEvent.payloadJson!)).toMatchObject(firstDecision)
    const currentValidation = await repository.read('validation', 'plan-one')
    const mismatchedValidation = parseYamlArtifact('validation', currentValidation.content) as ValidationArtifact
    mismatchedValidation.validationDecisions[0]!.decidedBy = 'tampered-reviewer'
    const mismatchedStored = await repository.compareAndWrite(
      'validation',
      'plan-one',
      currentValidation.hash,
      serializeYamlArtifact('validation', mismatchedValidation),
    )
    await syncPlans({ projectDirectory: workspace, client })
    const reviewBinding = {
      client,
      projectDirectory: workspace,
      operationHash: published.operationHash,
      extensionArtifactHashes: [] as string[],
    }
    // fallow-ignore-next-line code-duplication -- same binding intentionally proves reject then accept
    await expect(submitValidationReview('plan-one', reviewBinding)).rejects.toMatchObject({ code: 'CONFLICT' })
    mismatchedValidation.validationDecisions[0] = firstDecision
    await repository.compareAndWrite(
      'validation',
      'plan-one',
      mismatchedStored.hash,
      serializeYamlArtifact('validation', mismatchedValidation),
    )
    await syncPlans({ projectDirectory: workspace, client })
    await expect(submitValidationReview('plan-one', reviewBinding)).resolves.toMatchObject({
      plan: { lifecycle: 'validations_approved' },
    })
    expect((await client.planProjection.findUniqueOrThrow({ where: { planId: 'plan-one' } })).lifecycle).toBe(
      'validations_approved',
    )
    await expect(fs.stat(path.join(workspace, 'automation'))).rejects.toMatchObject({ code: 'ENOENT' })
    const approvedEvent = await client.planEvent.findFirstOrThrow({
      where: { planProjectionId: published.planProjectionId, type: 'validations_approved' },
    })
    expect(JSON.parse(approvedEvent.payloadJson!)).toMatchObject({
      projection: { operationHash: published.operationHash, extensionArtifactHashes: [] },
    })
  })

  it('persists the exact reviewed projection, preserves legacy validation, and scopes IDs per plan', async () => {
    const seedPreview = await previewValidationAstForPlan('plan-one', submission(), client)
    const legacyNode = structuredClone(seedPreview.canonicalProjection.validationNode)
    legacyNode.id = 'legacy'
    const legacy = {
      version: '1',
      planId: 'plan-one',
      revision: 1,
      baseRevision: { gitCommit: null, snapshotHash: planHash, reducedAssurance: false },
      classificationOverrides: [],
      validations: [legacyNode],
      approvals: [],
      validationDecisions: [],
      files: [],
      manifestPaths: [],
      baselineAttempts: [],
      baselineAcknowledgements: [],
      baselineDecision: 'pending',
    }
    await client.planProjection.update({
      where: { planId: 'plan-one' },
      data: { validationJson: JSON.stringify(legacy) },
    })
    const first = await previewValidationAstForPlan('plan-one', submission(), client)
    expect(first.blockers).toEqual([])
    const compiled = await compileValidationAstForPlan(
      {
        planId: 'plan-one',
        submission: submission(),
        expectedReceiptHash: first.receiptHash,
        projectDirectory: workspace,
      },
      client,
    )
    expect(compiled).toMatchObject({ phase: 'review_ready', projectionHash: first.canonicalProjection.projectionHash })
    await expect(readValidationAstExtensionReviewsForPlan('plan-one', compiled.id, client)).resolves.toMatchObject({
      operationId: compiled.id,
      decisionBindingHash: compiled.operationHash,
      extensions: [],
    })
    await client.validationAstPublishOperation.update({
      where: { id: compiled.id },
      data: { operationHash: `sha256:${'0'.repeat(64)}` },
    })
    await expect(readValidationAstExtensionReviewsForPlan('plan-one', compiled.id, client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await client.validationAstPublishOperation.update({
      where: { id: compiled.id },
      data: { operationHash: compiled.operationHash },
    })
    const stored = await client.planProjection.findUniqueOrThrow({ where: { planId: 'plan-one' } })
    const storedValidations = JSON.parse(stored.validationJson!).validations
    expect(storedValidations.map((item: { id: string }) => item.id)).toEqual(['legacy', 'navigation'])
    expect(storedValidations[1]).toEqual(first.canonicalProjection.validationNode)
    const second = await previewValidationAstForPlan('plan-two', submission(), client)
    expect(second.entities[0]!.caseId).not.toBe(first.entities[0]!.caseId)
    expect(second.receiptHash).not.toBe(first.receiptHash)
    expect(second.publishOperationId).not.toBe(first.publishOperationId)
  })

  it('rejects a tampered receipt without entities or events and cannot bypass lifecycle', async () => {
    const preview = await previewValidationAstForPlan('plan-one', submission(), client)
    expect(preview.blockers).toEqual([])
    const initialCaseCount = await client.testCase.count()
    await expect(
      compileValidationAstForPlan(
        { planId: 'plan-one', submission: submission(), expectedReceiptHash: `sha256:${'0'.repeat(64)}` },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await client.planEvent.count({ where: { plan: { planId: 'plan-one' } } })).toBe(0)
    expect(await client.testCase.count()).toBe(initialCaseCount)
    await client.planProjection.update({ where: { planId: 'plan-one' }, data: { lifecycle: 'validation_review' } })
    await expect(
      compileValidationAstForPlan(
        { planId: 'plan-one', submission: submission(), expectedReceiptHash: preview.receiptHash },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
