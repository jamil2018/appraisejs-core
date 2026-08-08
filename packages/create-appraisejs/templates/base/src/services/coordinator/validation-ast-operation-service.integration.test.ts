import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  copyMigratedTestDatabase,
  prepareCleanCoordinatorPlanRuntimeTestDatabase,
} from '@/test/plan-runtime-schema-test-helper'
import { basicValidationAstSubmission, sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import {
  checkValidationAstForPlan,
  compileValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionReviewsForPlan,
} from './validation-ast-operation-service'
import {
  decideValidationNode,
  submitValidationFeedback,
  submitValidationReview,
} from './coordinator-validation-service'
import { auditManagedValidationIntegrity } from './managed-validation-integrity-audit'
import { registerProjectResourceOwnership } from '@/services/project-resource/project-resource-ownership-service'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'

const planHash = `sha256:${'a'.repeat(64)}`
const contractHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const submission = (taskId = 'task-one') => basicValidationAstSubmission(planHash, taskId)
const invocation = (
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then' | 'And',
  description: string,
) => {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)
  if (!definition) throw new Error(`Missing built-in Step Definition ${id}.`)
  return {
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs,
    presentation: { keyword, description },
  }
}

const meditationSubmission = () => ({
  expectedPlanHash: planHash,
  authoringProfile: { id: 'simple-happy-path', version: '1' },
  ast: {
    schemaVersion: 2,
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
            invocation: invocation(
              'browser.navigation.goto',
              { url: '/meditate' },
              'Given',
              'the meditation page is open',
            ),
          },
          {
            id: 'start-meditation',
            invocation: invocation(
              'browser.mouse.click',
              { target: { ref: 'locator', id: 'locator_start-button', version: '1' } },
              'When',
              'the user starts meditation',
            ),
          },
          {
            id: 'confirm-accessibility',
            invocation: invocation(
              'browser.assertions.accessible',
              { target: { ref: 'locator', id: 'locator_completion', version: '1' } },
              'Then',
              'the completion is accessible',
            ),
          },
          {
            id: 'confirm-persistence',
            invocation: invocation(
              'browser.assertions.persisted',
              { target: { ref: 'locator', id: 'locator_completion', version: '1' } },
              'Then',
              'the persisted completion is visible',
            ),
          },
          {
            id: 'confirm-console-clean',
            invocation: invocation(
              'browser.assertions.no-console-errors',
              {},
              'And',
              'the browser reports no console errors',
            ),
          },
          {
            id: 'confirm-network-clean',
            invocation: invocation(
              'browser.assertions.no-failed-network-requests',
              {},
              'And',
              'the browser reports no failed network activity',
            ),
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
          observationStepIds: [
            'confirm-accessibility',
            'confirm-persistence',
            'confirm-console-clean',
            'confirm-network-clean',
          ],
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
  await copyMigratedTestDatabase(databasePath)
  client = sqliteTestClient(databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
  const stepRegistry = new StepDefinitionRegistryService(client)
  for (const definition of builtInStepDefinitions) await stepRegistry.registerBuiltIn(definition, 'source-conformance')
  const target = await client.targetProject.create({
    data: { canonicalPath: workspace, displayName: 'Target', fingerprint: `sha256:${'b'.repeat(64)}` },
  })
  const environment = await client.environment.upsert({
    where: { id: 'validation-operation-local' },
    update: { targetProjectId: target.id },
    create: {
      id: 'validation-operation-local',
      name: 'local',
      baseUrl: 'http://localhost',
      targetProjectId: target.id,
    },
  })
  const repository = new PlanArtifactRepository(workspace)
  await client.module.create({
    data: {
      id: 'meditation-module',
      name: 'Meditation',
      targetProjectId: target.id,
      locatorGroups: {
        create: {
          id: 'meditation-page',
          name: 'Meditation page',
          route: '/meditate',
          targetProjectId: target.id,
          locators: {
            create: [
              { id: 'start-button', name: 'Start button', value: '[data-testid="start"]', targetProjectId: target.id },
              {
                id: 'completion',
                name: 'Completion message',
                value: '[data-testid="completion"]',
                targetProjectId: target.id,
              },
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
    const firstReceipt = await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'c'.repeat(64)}`,
        candidateReferencesJson: JSON.stringify(
          proposal.ast.scenarios.flatMap(scenario =>
            scenario.steps.map(step => ({ id: step.invocation.step.id, version: step.invocation.step.version })),
          ),
        ),
        planId: 'plan-one',
        correlationId: 'agent-validation-flow',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })
    const selectedProposal = {
      ...proposal,
      stepDefinitionSelections: [{ receiptId: firstReceipt.id, correlationId: firstReceipt.correlationId }],
    }
    const checked = await checkValidationAstForPlan('plan-one', selectedProposal, client)
    expect(checked).toMatchObject({ valid: true, blockers: [] })
    await expect(
      client.stepDefinitionTelemetryEvent.findFirst({
        where: { outcome: 'valid_ast', planId: 'plan-one', surface: 'agent' },
      }),
    ).resolves.toMatchObject({ surface: 'agent', payloadJson: '{}' })
    // A later search for the same plan must not steal this AST's causality.
    await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'d'.repeat(64)}`,
        candidateReferencesJson: '[]',
        planId: 'plan-one',
        correlationId: 'later-search-must-not-win',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })
    const preview = await previewValidationAstForPlan('plan-one', selectedProposal, client)
    expect(preview).toMatchObject({
      valid: true,
      authoringProfile: { id: 'simple-happy-path', version: '1' },
    })
    expect(preview.operations).toHaveLength(6)
    expect(preview.locators).toHaveLength(2)
    expect(preview.customExtensions.length).toBeLessThanOrEqual(1)
    await previewValidationAstForPlan('plan-one', selectedProposal, client)
    expect(
      await client.planEvent.count({ where: { plan: { planId: 'plan-one' }, type: 'validation_ast_previewed' } }),
    ).toBe(1)
    const published = await compileValidationAstForPlan(
      {
        planId: 'plan-one',
        submission: selectedProposal,
        expectedReceiptHash: preview.receiptHash,
        projectDirectory: workspace,
      },
      client,
    )
    expect(published).toMatchObject({ phase: 'review_ready', receiptHash: preview.receiptHash })
    expect(JSON.parse(published.runtimeInputJson!)).toMatchObject({
      lifecycleCorrelation: { planId: 'plan-one', correlationId: expect.stringMatching(/^sha256:/) },
    })
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
    const reviewReady = await client.planEvent.findFirstOrThrow({
      where: { publishOperationId: published.id, type: 'validation_review_ready' },
    })
    expect(JSON.parse(reviewReady.payloadJson!)).toMatchObject({
      operationId: published.id,
      receiptHash: preview.receiptHash,
      validationHash: hashFileContent(validationArtifact.content),
      extensionReviewHashes: [],
    })
    await syncPlans({ projectDirectory: workspace, client })
    await expect(
      auditManagedValidationIntegrity('plan-one', { client, projectDirectory: workspace }),
    ).resolves.toMatchObject({
      status: 'green',
      mismatches: [],
      nextRepairAction: undefined,
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
    expect(firstDecision.reviewBinding).toMatchObject({
      operationId: published.id,
      operationHash: published.operationHash,
      reviewStateHash: expect.stringMatching(/^sha256:/),
      extensionArtifactHashes: [],
    })
    await new Promise(resolve => setTimeout(resolve, 5))
    const retriedDecision = await decideValidationNode(
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
    expect(retriedDecision).toEqual(firstDecision)

    await submitValidationFeedback(
      {
        planId: 'plan-one',
        scope: 'test_artifact',
        target: { type: 'plan' },
        body: 'Add the secondary validation path.',
      },
      { client, projectDirectory: workspace },
    )
    const reviewAfterFeedbackStored = await repository.read('review', 'plan-one')
    const reviewAfterFeedback = parseYamlArtifact('review', reviewAfterFeedbackStored.content) as ReviewArtifact
    reviewAfterFeedback.threads.at(-1)!.events.push({
      id: 'resolve-secondary-feedback',
      action: 'resolved',
      actor: 'reviewer',
      createdAt: new Date().toISOString(),
    })
    await repository.compareAndWrite(
      'review',
      'plan-one',
      reviewAfterFeedbackStored.hash,
      serializeYamlArtifact('review', reviewAfterFeedback),
    )
    await syncPlans({ projectDirectory: workspace, client })
    const currentPlanHash = (
      await client.planProjection.findUniqueOrThrow({ where: { planId: 'plan-one' }, select: { sourceHash: true } })
    ).sourceHash
    const secondaryBase = { ...submission(), expectedPlanHash: currentPlanHash }
    const secondaryReceipt = await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'e'.repeat(64)}`,
        candidateReferencesJson: JSON.stringify(
          secondaryBase.ast.scenarios.flatMap(scenario =>
            scenario.steps.map(step => ({ id: step.invocation.step.id, version: step.invocation.step.version })),
          ),
        ),
        planId: 'plan-one',
        correlationId: 'secondary-validation-flow',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })
    const secondaryProposal = {
      ...secondaryBase,
      stepDefinitionSelections: [{ receiptId: secondaryReceipt.id, correlationId: secondaryReceipt.correlationId }],
    }
    const secondaryPreview = await previewValidationAstForPlan('plan-one', secondaryProposal, client)
    expect(secondaryPreview).toMatchObject({ valid: true, blockers: [] })
    const secondaryPublished = await compileValidationAstForPlan(
      {
        planId: 'plan-one',
        submission: secondaryProposal,
        expectedReceiptHash: secondaryPreview.receiptHash,
        projectDirectory: workspace,
      },
      client,
    )
    const secondDecision = await decideValidationNode(
      {
        planId: 'plan-one',
        validationId: 'navigation',
        decision: 'approved',
        decidedBy: 'reviewer',
        operationHash: secondaryPublished.operationHash,
        extensionArtifactHashes: [],
      },
      { client, projectDirectory: workspace },
    )
    expect(secondDecision.reviewBinding.operationId).toBe(secondaryPublished.id)
    expect(
      await client.planEvent.count({ where: { type: 'validation_node_decided', plan: { planId: 'plan-one' } } }),
    ).toBe(2)
    const exactReviewBinding = {
      client,
      projectDirectory: workspace,
      operationHash: secondaryPublished.operationHash,
      reviewStateHash: secondDecision.reviewBinding.reviewStateHash,
      extensionArtifactHashes: [] as string[],
    }
    const firstDecisionEvent = await client.planEvent.findUniqueOrThrow({
      where: {
        publishOperationId_validationId: {
          publishOperationId: published.id,
          validationId: firstDecision.validationId,
        },
      },
    })
    await client.planEvent.update({ where: { id: firstDecisionEvent.id }, data: { validationId: 'navigation' } })
    await expect(submitValidationReview('plan-one', exactReviewBinding)).resolves.toMatchObject({
      plan: { lifecycle: 'validations_approved' },
    })
    await client.planEvent.update({
      where: { id: firstDecisionEvent.id },
      data: { validationId: firstDecision.validationId },
    })
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
    expect(JSON.parse(decisionEvent.payloadJson!)).toMatchObject({
      validationId: firstDecision.validationId,
      decision: firstDecision.decision,
      contentHash: firstDecision.contentHash,
      decidedBy: firstDecision.decidedBy,
      decidedAt: firstDecision.decidedAt,
    })
    await expect(
      auditManagedValidationIntegrity('plan-one', { client, projectDirectory: workspace }),
    ).resolves.toMatchObject({
      status: 'not_applicable',
      mismatches: [],
    })
    const currentPlan = await repository.read('plan', 'plan-one')
    const awaitingReviewPlan = parseYamlArtifact('plan', currentPlan.content) as PlanArtifact
    await repository.compareAndWrite(
      'plan',
      'plan-one',
      currentPlan.hash,
      serializeYamlArtifact('plan', { ...awaitingReviewPlan, lifecycle: 'awaiting_validation_review' }),
    )
    await syncPlans({ projectDirectory: workspace, client })
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
    // fallow-ignore-next-line code-duplication -- same binding intentionally proves reject then accept
    await expect(submitValidationReview('plan-one', exactReviewBinding)).rejects.toMatchObject({ code: 'CONFLICT' })
    mismatchedValidation.validationDecisions[0] = firstDecision
    await repository.compareAndWrite(
      'validation',
      'plan-one',
      mismatchedStored.hash,
      serializeYamlArtifact('validation', mismatchedValidation),
    )
    await syncPlans({ projectDirectory: workspace, client })
    await expect(submitValidationReview('plan-one', exactReviewBinding)).resolves.toMatchObject({
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
      projection: { operationHash: secondaryPublished.operationHash, extensionArtifactHashes: [] },
    })
  })

  it('keeps the human validation funnel correlated without an agent search receipt', async () => {
    const proposal = meditationSubmission()
    await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'b'.repeat(64)}`,
        candidateReferencesJson: '[]',
        planId: 'plan-two',
        correlationId: 'agent-receipt-must-not-relabel-human',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })
    await expect(checkValidationAstForPlan('plan-two', proposal, client)).resolves.toMatchObject({
      valid: true,
      blockers: [],
    })
    await expect(
      client.stepDefinitionTelemetryEvent.findFirst({
        where: { outcome: 'valid_ast', planId: 'plan-two', correlationId: 'plan:plan-two' },
      }),
    ).resolves.toMatchObject({ surface: 'human', payloadJson: '{}' })

    const preview = await previewValidationAstForPlan('plan-two', proposal, client)
    const published = await compileValidationAstForPlan(
      {
        planId: 'plan-two',
        submission: proposal,
        expectedReceiptHash: preview.receiptHash,
        projectDirectory: workspace,
      },
      client,
    )
    expect(JSON.parse(published.runtimeInputJson!)).toMatchObject({
      lifecycleCorrelation: { planId: 'plan-two', correlationId: 'plan:plan-two' },
    })
  })

  it('rejects a selection receipt from another plan or an expired selection receipt', async () => {
    const proposal = meditationSubmission()
    const references = proposal.ast.scenarios.flatMap(scenario =>
      scenario.steps.map(step => ({ id: step.invocation.step.id, version: step.invocation.step.version })),
    )
    const foreign = await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'e'.repeat(64)}`,
        candidateReferencesJson: JSON.stringify(references),
        planId: 'plan-two',
        correlationId: 'foreign-selection',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })
    await expect(
      checkValidationAstForPlan(
        'plan-one',
        {
          ...proposal,
          stepDefinitionSelections: [{ receiptId: foreign.id, correlationId: foreign.correlationId }],
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const expired = await client.stepDefinitionSearchReceipt.create({
      data: {
        indexHash: `sha256:${'f'.repeat(64)}`,
        candidateReferencesJson: JSON.stringify(references),
        planId: 'plan-one',
        correlationId: 'expired-selection',
        expiresAt: new Date(Date.now() - 1),
      },
    })
    await expect(
      checkValidationAstForPlan(
        'plan-one',
        {
          ...proposal,
          stepDefinitionSelections: [{ receiptId: expired.id, correlationId: expired.correlationId }],
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
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

  it('rejects a tampered receipt without entities or publish events and cannot bypass lifecycle', async () => {
    const preview = await previewValidationAstForPlan('plan-one', submission(), client)
    expect(preview.blockers).toEqual([])
    const initialCaseCount = await client.testCase.count()
    await expect(
      compileValidationAstForPlan(
        { planId: 'plan-one', submission: submission(), expectedReceiptHash: `sha256:${'0'.repeat(64)}` },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await client.planEvent.findMany({
        where: { plan: { planId: 'plan-one' } },
        select: { type: true },
      }),
    ).toEqual([{ type: 'validation_ast_previewed' }])
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
