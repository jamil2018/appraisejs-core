import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { listOperationCapabilities, operationValidationRegistry } from '@/lib/operation-catalog'
import { sealPersistedReadyStepDefinition } from '@/lib/runtime-capsule/step-definition-closure'
import type { StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  validationArtifactSchema,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository, PlanRepositoryError } from '@/lib/plans/artifact-repository'
import { hashFileContent } from '@/lib/validation-review/file-review'
import {
  checkValidationAst,
  createCustomExtensionPolicy,
  compiledCustomExtensionSchema,
  previewValidationAst,
  validationAstSubmissionSchema,
  type ValidationAstCompilerContext,
} from '@/lib/validation-ast'
import { ServiceError } from '@/services/shared/errors'
import { buildValidationAstReviewPreview } from '@/lib/validation-ast/review-preview'
import { locatorBindingsForAst } from '@/lib/validation-ast/canonical-projection'
import { readVisibleResourceOwnerships } from '@/services/project-resource/project-resource-ownership-service'
import { buildLocatorGraph } from '@/services/locator-graph/locator-graph-service'
import {
  buildCompiledValidationAstResult,
  PROJECT_EXTENSION_CAPABILITY_IMPORTS,
} from './validation-ast-compiler-service'
import { prepareValidationAstPublish } from './validation-ast-publish-journal-service'
import { validateStoredValidationAstPublish } from './validation-ast-publish-journal-service'
import { resumeValidationAstPublish } from './validation-ast-publish-orchestrator'
import { appendPlanEvent } from './coordinator-service'
import { recordStepDefinitionTelemetry } from '@/services/step-definition/step-definition-telemetry'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

async function loadValidationAstContext(planId: string, client: PrismaClient) {
  const plan = await client.planProjection.findUnique({
    where: { planId },
    include: { tasks: { orderBy: { position: 'asc' } }, targetProject: true },
  })
  if (!plan) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (!plan.targetProject) throw new ServiceError('Plan must be bound to an authoritative target project.', 'CONFLICT')
  if (!['preparing_validations', 'validation_changes_requested'].includes(plan.lifecycle))
    throw new ServiceError('The plan is not preparing validations.', 'CONFLICT')
  const [locatorGraph, allEnvironments, environmentOwnerships, persistedStepDefinitions] = await Promise.all([
    buildLocatorGraph(client, plan.targetProject.id),
    client.environment.findMany({ where: { targetProjectId: plan.targetProject.id }, orderBy: { name: 'asc' } }),
    readVisibleResourceOwnerships(plan.targetProject.id, ['environment'], client),
    client.stepDefinition.findMany({
      where: { status: 'ready' },
      include: { publicationReceipt: true },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
    }),
  ])
  const environments = allEnvironments.filter(
    environment => !environmentOwnerships || environmentOwnerships.has(`environment:${environment.id}`),
  )
  const environmentContext = Object.fromEntries(
    environments.flatMap(environment => {
      const descriptor = {
        keys: ['baseUrl'],
        types: { baseUrl: 'string' },
        name: environment.name,
        reference: environment.id,
      }
      return [
        [environment.id, descriptor],
        [environment.name, descriptor],
      ]
    }),
  )
  const extensionPolicy = createCustomExtensionPolicy({
    projectId: plan.targetProject.id,
    projectFingerprint: plan.targetProject.fingerprint,
    capabilityImports: PROJECT_EXTENSION_CAPABILITY_IMPORTS,
  })
  const stepDefinitions = new Map<string, { definition: StepDefinition; definitionHash: string; receiptHash: string }>()
  for (const row of persistedStepDefinitions) {
    let sealed
    try {
      sealed = sealPersistedReadyStepDefinition(row)
    } catch {
      throw new ServiceError(
        `Persisted Step Definition ${row.id}@${row.version} is not valid published authority.`,
        'CONFLICT',
      )
    }
    stepDefinitions.set(`${sealed.step.id}@${sealed.step.version}`, {
      definition: sealed.definition,
      definitionHash: sealed.step.definitionHash,
      receiptHash: sealed.hashes.publicationReceipt,
    })
  }
  const builtInBrowserCapabilities = listOperationCapabilities('browser')
  const compilerContext: ValidationAstCompilerContext = {
    project: { id: plan.targetProject.id, fingerprint: plan.targetProject.fingerprint },
    planScope: `${plan.targetProject.fingerprint}:${plan.planId}`,
    currentPlanHash: plan.sourceHash,
    planTaskIds: plan.tasks.map(task => task.taskId),
    operationRegistry: operationValidationRegistry,
    stepDefinitions,
    locatorGraph,
    environments: environmentContext,
    availableRuntimes: ['browser'],
    availableCapabilities: builtInBrowserCapabilities,
    extensionPolicy,
  }
  const contextHash = hash({
    targetFingerprint: plan.targetProject.fingerprint,
    planHash: plan.sourceHash,
    catalogHash: operationValidationRegistry.manifestHash,
    stepDefinitions: [...stepDefinitions.entries()].map(([key, value]) => [key, value.definitionHash]),
    locatorGraphHash: locatorGraph.contentHash,
    environments: environmentContext,
    extensionPolicy,
  })
  return { plan, compilerContext, contextHash }
}

type LifecycleSelection = { planId: string; correlationId: string; surface: 'agent' | 'human' }
type ValidationAstSubmission = ReturnType<typeof validationAstSubmissionSchema.parse>

function humanLifecycleSelection(planId: string): LifecycleSelection {
  return { planId, correlationId: `plan:${planId}`, surface: 'human' }
}

function uniqueSelectionReceipts(selections: NonNullable<ValidationAstSubmission['stepDefinitionSelections']>) {
  const sorted = [...selections].sort((left, right) => left.receiptId.localeCompare(right.receiptId))
  if (new Set(sorted.map(item => item.receiptId)).size !== sorted.length)
    throw new ServiceError('Validation AST Step Definition selection receipts must be unique.', 'VALIDATION')
  return sorted
}

function isCurrentSelectionReceipt(
  receipt: Awaited<ReturnType<PrismaClient['stepDefinitionSearchReceipt']['findUnique']>>,
  selection: { correlationId: string },
  planId: string,
): receipt is NonNullable<Awaited<ReturnType<PrismaClient['stepDefinitionSearchReceipt']['findUnique']>>> {
  return (
    !!receipt &&
    receipt.planId === planId &&
    receipt.correlationId === selection.correlationId &&
    receipt.expiresAt > new Date()
  )
}

function receiptReferences(
  receipt: NonNullable<Awaited<ReturnType<PrismaClient['stepDefinitionSearchReceipt']['findUnique']>>>,
) {
  return z
    .array(z.object({ id: z.string(), version: z.string() }))
    .parse(JSON.parse(receipt.candidateReferencesJson))
    .map(reference => `${reference.id}@${reference.version}`)
}

function assertAstReferencesAreSelected(submission: ValidationAstSubmission, references: Set<string>) {
  const astReferences = submission.ast.scenarios.flatMap(scenario =>
    scenario.steps.map(step => `${step.invocation.step.id}@${step.invocation.step.version}`),
  )
  if (astReferences.some(reference => !references.has(reference)))
    throw new ServiceError('Validation AST Step References are not covered by its exact selection receipt.', 'CONFLICT')
}

async function resolveLifecycleSelection(
  planId: string,
  submission: unknown,
  client: PrismaClient,
): Promise<{ submission: ReturnType<typeof validationAstSubmissionSchema.parse>; lifecycle: LifecycleSelection }> {
  const parsed = validationAstSubmissionSchema.parse(submission)
  const provided = parsed.stepDefinitionSelections
  const receipts = client.stepDefinitionSearchReceipt
  // Human UI submissions without a selected result retain the stable plan
  // funnel; agent submissions must carry the server-issued receipt.
  if (!provided) return { submission: parsed, lifecycle: humanLifecycleSelection(planId) }
  const sorted = uniqueSelectionReceipts(provided)
  const rows = await Promise.all(sorted.map(item => receipts.findUnique({ where: { id: item.receiptId } })))
  const references = new Set<string>()
  for (const [index, receipt] of rows.entries()) {
    const evidence = sorted[index]!
    if (!isCurrentSelectionReceipt(receipt, evidence, planId))
      throw new ServiceError(
        'Validation AST Step Definition selection receipt is invalid, expired, or belongs to another plan.',
        'CONFLICT',
      )
    for (const reference of receiptReferences(receipt)) references.add(reference)
  }
  assertAstReferencesAreSelected(parsed, references)
  return { submission: parsed, lifecycle: { planId, correlationId: hash({ selections: sorted }), surface: 'agent' } }
}

export async function checkValidationAstForPlan(planId: string, submission: unknown, client: PrismaClient = prisma) {
  const context = await loadValidationAstContext(planId, client)
  const selected = await resolveLifecycleSelection(planId, submission, client)
  const checked = checkValidationAst(selected.submission, context.compilerContext)
  if (checked.valid) {
    await recordStepDefinitionTelemetry(client, {
      surface: selected.lifecycle.surface,
      outcome: 'valid_ast',
      correlationId: selected.lifecycle.correlationId,
      planId: selected.lifecycle.planId,
      payload: {},
    })
  }
  return { ...checked, contextHash: context.contextHash }
}

export async function readValidationAstExtensionPolicyForPlan(planId: string, client: PrismaClient = prisma) {
  return (await loadValidationAstContext(planId, client)).compilerContext.extensionPolicy
}

export async function readValidationAstExtensionReviewsForPlan(
  planId: string,
  operationId: string | undefined,
  client: PrismaClient = prisma,
) {
  const operation = await client.validationAstPublishOperation.findFirst({
    where: { planId, ...(operationId ? { id: operationId } : {}), phase: 'review_ready' },
    orderBy: { createdAt: 'desc' },
    include: { extensionReviews: { orderBy: [{ extensionId: 'asc' }, { version: 'asc' }] } },
  })
  if (!operation) throw new ServiceError('Published Validation AST review was not found.', 'NOT_FOUND')
  validateStoredValidationAstPublish(operation as never)
  return {
    planId,
    operationId: operation.id,
    operationHash: operation.operationHash,
    decisionBindingHash: operation.operationHash,
    receiptHash: operation.receiptHash,
    extensions: operation.extensionReviews.map(review =>
      compiledCustomExtensionSchema.parse(JSON.parse(review.artifactJson)),
    ),
  }
}

export async function previewValidationAstForPlan(planId: string, submission: unknown, client: PrismaClient = prisma) {
  const context = await loadValidationAstContext(planId, client)
  const selected = await resolveLifecycleSelection(planId, submission, client)
  const preview = bindPublishProvenance(
    previewValidationAst(selected.submission, context.compilerContext),
    context,
    selected.lifecycle,
  )
  const eventPayload = buildValidationAstReviewPreview({
    submission: selected.submission,
    valid: preview.valid,
    previewHash: preview.previewHash,
    receiptHash: preview.receiptHash,
    warnings: preview.warnings,
    blockers: preview.blockers,
  })
  if (client.planEvent?.findFirst) {
    const latest = await client.planEvent.findFirst({
      where: { plan: { planId }, type: 'validation_ast_previewed' },
      orderBy: { sequence: 'desc' },
      select: { payloadJson: true },
    })
    let latestPreviewHash: unknown
    try {
      latestPreviewHash = latest?.payloadJson
        ? (JSON.parse(latest.payloadJson) as { previewHash?: unknown }).previewHash
        : undefined
    } catch {
      latestPreviewHash = undefined
    }
    if (latestPreviewHash !== preview.previewHash) {
      await appendPlanEvent({ planId, type: 'validation_ast_previewed', payload: eventPayload }, client)
    }
  }
  return {
    ...preview,
    contextHash: context.contextHash,
    receiptHash: preview.receiptHash,
  }
}

function bindPublishProvenance(
  preview: ReturnType<typeof previewValidationAst>,
  context: Awaited<ReturnType<typeof loadValidationAstContext>>,
  lifecycle: LifecycleSelection,
) {
  const receiptHash = hash({ previewHash: preview.previewHash, contextHash: context.contextHash, lifecycle })
  const publishOperationId = `astpub_${receiptHash.slice('sha256:'.length)}`
  const runtimeInput = {
    schemaVersion: '2',
    targetProjectId: context.plan.targetProject!.id,
    targetFingerprint: context.plan.targetProject!.fingerprint,
    astId: preview.canonicalProjection.validationNode.id,
    astHash: preview.astHash,
    contextHash: context.contextHash,
    previewHash: preview.previewHash,
    receiptHash,
    lifecycleCorrelation: { planId: lifecycle.planId, correlationId: lifecycle.correlationId },
    compilerReceipt: preview.commandReceipt,
    extensionPolicy: context.compilerContext.extensionPolicy,
    rootInvocations: preview.canonicalProjection.validationNode.appraiseArtifacts.testCases.flatMap(testCase =>
      [...testCase.steps]
        .sort((left, right) => left.order - right.order)
        .map(step => ({ caseId: testCase.id, stepId: step.id, invocation: step.invocation })),
    ),
    stepDefinitions: [
      ...new Map(
        preview.canonicalProjection.validationNode.appraiseArtifacts.testCases.flatMap(testCase =>
          testCase.steps.map(step => [
            `${step.invocation.step.id}@${step.invocation.step.version}#${step.invocation.step.definitionHash}`,
            step.invocation.step,
          ]),
        ),
      ).values(),
    ].sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`)),
    locators: preview.locators.map(locator => ({
      ...locator,
      binding: preview.canonicalProjection.validationNode.appraiseArtifacts.locators.find(
        item => item.id === locator.id.replace(/^locator_/, ''),
      ),
    })),
    extensions: preview.customExtensions.map(extension => ({
      id: extension.extension.id,
      version: extension.extension.version,
      sourceHash: extension.sourceHash,
      compiledHash: extension.compiledHash,
      artifactHash: hash(extension),
    })),
    matrix: preview.canonicalProjection.validationNode.matrix,
    expected: {
      scenarios: preview.entities,
      scenarioCount: preview.entities.length,
    },
    gherkinHash: hash(preview.canonicalProjection.gherkin),
  }
  const runtimeInputJson = canonicalContractJson(runtimeInput)
  const runtimeInputHash = hash(runtimeInput)
  const validationNode = {
    ...preview.canonicalProjection.validationNode,
    astProvenance: {
      schemaVersion: '2' as const,
      astHash: preview.astHash,
      executionAuthority: 'reviewed_publication' as const,
      publishOperationId,
      receiptHash,
      runtimeInputHash,
    },
  }
  const canonicalProjection = {
    validationNode,
    gherkin: preview.canonicalProjection.gherkin,
    projectionHash: hash({ validationNode, gherkin: preview.canonicalProjection.gherkin }),
  }
  return {
    ...preview,
    canonicalProjection,
    baseProjectionHash: preview.canonicalProjection.projectionHash,
    receiptHash,
    publishOperationId,
    runtimeInputJson,
    runtimeInputHash,
  }
}

export async function compileValidationAstForPlan(
  input: { planId: string; submission: unknown; expectedReceiptHash: string; projectDirectory?: string },
  client: PrismaClient = prisma,
) {
  const context = await loadValidationAstContext(input.planId, client)
  const selected = await resolveLifecycleSelection(input.planId, input.submission, client)
  const checked = checkValidationAst(selected.submission, context.compilerContext)
  const preview = bindPublishProvenance(
    previewValidationAst(selected.submission, context.compilerContext),
    context,
    selected.lifecycle,
  )
  if (!preview.valid)
    throw new ServiceError('Validation AST must pass check and preview before compilation.', 'VALIDATION')
  const receiptHash = preview.receiptHash
  if (receiptHash !== input.expectedReceiptHash)
    throw new ServiceError('Validation AST preview receipt is stale.', 'CONFLICT')
  const existingOperation = await client.validationAstPublishOperation.findUnique({
    where: { id: preview.publishOperationId },
  })
  if (existingOperation)
    return resumeValidationAstPublish(existingOperation.id, { client, projectDirectory: input.projectDirectory })
  const existing = context.plan.validationJson
    ? validationArtifactSchema.parse(JSON.parse(context.plan.validationJson))
    : undefined
  const validation: ValidationArtifact = existing
    ? existing
    : {
        version: '1',
        planId: input.planId,
        revision: context.plan.revision,
        baseRevision: { gitCommit: null, snapshotHash: context.plan.sourceHash, reducedAssurance: false },
        classificationOverrides: [],
        validations: [],
        approvals: [],
        validationDecisions: [],
        files: [],
        manifestPaths: [],
        baselineAttempts: [],
        baselineAcknowledgements: [],
        baselineDecision: 'pending',
      }
  const expectedValidationJson = context.plan.validationJson
  const result = await buildCompiledValidationAstResult(
    {
      planId: input.planId,
      ast: checked.submission.ast,
      expectedAstHash: preview.astHash,
      expectedProjectionHash: preview.baseProjectionHash,
      customExtensionProposals: checked.submission.customExtensionProposals,
      expectedCompiledExtensionHashes: Object.fromEntries(
        preview.customExtensions.map(extension => [
          `${extension.extension.id}@${extension.extension.version}`,
          extension.compiledHash,
        ]),
      ),
      validation,
      resolvedLocators: locatorBindingsForAst(
        checked.submission.ast,
        context.compilerContext.locatorGraph,
        context.compilerContext.planScope,
      ),
      planScope: context.compilerContext.planScope,
      assertCurrent: async transaction => {
        const current = await loadValidationAstContext(input.planId, transaction)
        await resolveLifecycleSelection(input.planId, selected.submission, transaction)
        if (current.contextHash !== context.contextHash || current.plan.validationJson !== expectedValidationJson)
          throw new ServiceError('Validation AST compilation context changed after preview.', 'CONFLICT')
      },
    },
    client,
  )
  const repository = new PlanArtifactRepository(input.projectDirectory)
  const [planStored, reviewStored] = await Promise.all([
    repository.read('plan', input.planId),
    repository.read('review', input.planId),
  ])
  let validationStored: Awaited<ReturnType<typeof repository.read>> | undefined
  try {
    validationStored = await repository.read('validation', input.planId)
  } catch (error) {
    if (!(error instanceof PlanRepositoryError) || error.code !== 'not-found') throw error
  }
  const planArtifact = parseYamlArtifact('plan', planStored.content) as PlanArtifact
  const reviewArtifact = parseYamlArtifact('review', reviewStored.content) as ReviewArtifact
  if (planArtifact.lifecycle !== context.plan.lifecycle || planArtifact.revision !== context.plan.revision)
    throw new ServiceError('Plan artifact changed before Validation AST publish preparation.', 'CONFLICT')
  const planContent = serializeYamlArtifact('plan', { ...planArtifact, lifecycle: 'awaiting_validation_review' })
  const reviewContent = serializeYamlArtifact('review', reviewArtifact)
  const targetProject = context.plan.targetProject
  if (!targetProject) throw new ServiceError('Plan target project is missing.', 'CONFLICT')
  const { publishOperationId, runtimeInputHash, runtimeInputJson } = preview
  const validationNode = result.validation.validations.find(validation => validation.id === result.astId)
  if (!validationNode?.astProvenance)
    throw new ServiceError('Compiled Validation AST provenance is missing.', 'CONFLICT')
  validationNode.astProvenance = preview.canonicalProjection.validationNode.astProvenance
  const projection = {
    validationNode: preview.canonicalProjection.validationNode,
    gherkin: preview.canonicalProjection.gherkin,
  }
  const projectionHash = preview.canonicalProjection.projectionHash
  const validationContentWithProvenance = serializeYamlArtifact('validation', result.validation)
  const operation = await prepareValidationAstPublish(
    {
      id: publishOperationId,
      planId: input.planId,
      planProjectionId: context.plan.id,
      targetProjectId: targetProject.id,
      targetFingerprint: targetProject.fingerprint,
      idempotencyKey: input.expectedReceiptHash,
      expectedPlanHash: context.plan.sourceHash,
      expectedPlanArtifactHash: planStored.hash,
      expectedValidationHash: validationStored?.hash,
      expectedReviewHash: reviewStored.hash,
      planHash: hashFileContent(planContent),
      validationHash: hashFileContent(validationContentWithProvenance),
      reviewHash: hashFileContent(reviewContent),
      planContent,
      validationContent: validationContentWithProvenance,
      reviewContent,
      astId: result.astId,
      astHash: result.astHash,
      contextHash: context.contextHash,
      previewHash: preview.previewHash,
      receiptHash,
      projectionHash,
      projectionJson: canonicalContractJson(projection),
      validationProjectionJson: JSON.stringify(result.validation),
      runtimeInputHash,
      runtimeInputJson,
      extensionReviews: result.compiledExtensions.map(extension => ({
        extensionId: extension.extension.id,
        version: extension.extension.version,
        sourceHash: extension.sourceHash,
        compiledHash: extension.compiledHash,
        artifactHash: hash(extension),
        artifactJson: JSON.stringify(extension),
      })),
    },
    client,
  )
  return resumeValidationAstPublish(operation.id, { client, projectDirectory: input.projectDirectory })
}
