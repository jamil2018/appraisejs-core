import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { defaultActionCatalog } from '@/lib/action-catalog'
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
  type ValidationAstCompilerContext,
} from '@/lib/validation-ast'
import { ServiceError } from '@/services/shared/errors'
import { buildLocatorGraph } from '@/services/locator-graph/locator-graph-service'
import {
  buildCompiledValidationAstResult,
  PROJECT_EXTENSION_CAPABILITY_IMPORTS,
  type ResolvedLocatorBinding,
} from './validation-ast-compiler-service'
import { prepareValidationAstPublish } from './validation-ast-publish-journal-service'
import { validateStoredValidationAstPublish } from './validation-ast-publish-journal-service'
import { resumeValidationAstPublish } from './validation-ast-publish-orchestrator'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

async function loadValidationAstContext(planId: string, client: PrismaClient) {
  const [plan, locatorGraph, environments] = await Promise.all([
    client.planProjection.findUnique({
      where: { planId },
      include: { tasks: { orderBy: { position: 'asc' } }, targetProject: true },
    }),
    buildLocatorGraph(client),
    client.environment.findMany({ orderBy: { name: 'asc' } }),
  ])
  if (!plan) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (!plan.targetProject) throw new ServiceError('Plan must be bound to an authoritative target project.', 'CONFLICT')
  if (!['preparing_validations', 'validation_changes_requested'].includes(plan.lifecycle))
    throw new ServiceError('The plan is not preparing validations.', 'CONFLICT')
  const environmentContext = Object.fromEntries(
    environments.map(environment => [environment.name, { keys: ['baseUrl'] }]),
  )
  const extensionPolicy = createCustomExtensionPolicy({
    projectId: plan.targetProject.id,
    projectFingerprint: plan.targetProject.fingerprint,
    capabilityImports: PROJECT_EXTENSION_CAPABILITY_IMPORTS,
  })
  const compilerContext: ValidationAstCompilerContext = {
    project: { id: plan.targetProject.id, fingerprint: plan.targetProject.fingerprint },
    planScope: `${plan.targetProject.fingerprint}:${plan.planId}`,
    currentPlanHash: plan.sourceHash,
    planTaskIds: plan.tasks.map(task => task.taskId),
    actionCatalog: defaultActionCatalog,
    locatorGraph,
    environments: environmentContext,
    availableRuntimes: ['browser'],
    availableCapabilities: ['navigation', 'mouse', 'forms', 'waits', 'assertions'],
    extensionPolicy,
  }
  const contextHash = hash({
    targetFingerprint: plan.targetProject.fingerprint,
    planHash: plan.sourceHash,
    catalogHash: defaultActionCatalog.catalogHash,
    locatorGraphHash: locatorGraph.contentHash,
    environments: environmentContext,
    extensionPolicy,
  })
  return { plan, compilerContext, contextHash }
}

export async function checkValidationAstForPlan(planId: string, submission: unknown, client: PrismaClient = prisma) {
  const context = await loadValidationAstContext(planId, client)
  return { ...checkValidationAst(submission, context.compilerContext), contextHash: context.contextHash }
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
  const preview = previewValidationAst(submission, context.compilerContext)
  return {
    ...preview,
    contextHash: context.contextHash,
    receiptHash: hash({ previewHash: preview.previewHash, contextHash: context.contextHash }),
  }
}

function locatorBindings(context: ValidationAstCompilerContext, locatorIds: Set<string>): ResolvedLocatorBinding[] {
  const groups = new Map(
    context.locatorGraph.nodes
      .filter(
        (
          node,
        ): node is Extract<ValidationAstCompilerContext['locatorGraph']['nodes'][number], { type: 'locator-group' }> =>
          node.type === 'locator-group',
      )
      .map(node => [node.id, node]),
  )
  return context.locatorGraph.nodes
    .filter(
      (node): node is Extract<ValidationAstCompilerContext['locatorGraph']['nodes'][number], { type: 'locator' }> =>
        node.type === 'locator' && locatorIds.has(node.id),
    )
    .map(locator => {
      const group = groups.get(locator.groupId)
      const selector = locator.strategy.value.selector
      if (!group || typeof selector !== 'string')
        throw new ServiceError(`Locator ${locator.id} cannot be projected.`, 'VALIDATION')
      const surface = context.locatorGraph.nodes.find(
        node => node.type === 'surface' && node.id === locator.scope.surfaceId,
      )
      return {
        refId: locator.id,
        id: locator.id.replace(/^locator_/, ''),
        name: locator.title,
        value: selector,
        groupId: group.id.replace(/^group_/, ''),
        groupName: group.title,
        route: surface?.type === 'surface' ? (surface.route ?? '/') : '/',
      }
    })
}

export async function compileValidationAstForPlan(
  input: { planId: string; submission: unknown; expectedReceiptHash: string; projectDirectory?: string },
  client: PrismaClient = prisma,
) {
  const context = await loadValidationAstContext(input.planId, client)
  const checked = checkValidationAst(input.submission, context.compilerContext)
  const preview = previewValidationAst(input.submission, context.compilerContext)
  if (!preview.valid)
    throw new ServiceError('Validation AST must pass check and preview before compilation.', 'VALIDATION')
  const receiptHash = hash({ previewHash: preview.previewHash, contextHash: context.contextHash })
  if (receiptHash !== input.expectedReceiptHash)
    throw new ServiceError('Validation AST preview receipt is stale.', 'CONFLICT')
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
      expectedProjectionHash: preview.canonicalProjection.projectionHash,
      customExtensionProposals: checked.submission.customExtensionProposals,
      expectedCompiledExtensionHashes: Object.fromEntries(
        preview.customExtensions.map(extension => [
          `${extension.extension.id}@${extension.extension.version}`,
          extension.compiledHash,
        ]),
      ),
      validation,
      resolvedLocators: locatorBindings(context.compilerContext, new Set(preview.locators.map(locator => locator.id))),
      planScope: context.compilerContext.planScope,
      assertCurrent: async transaction => {
        const current = await loadValidationAstContext(input.planId, transaction)
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
  const validationContent = serializeYamlArtifact('validation', result.validation)
  const reviewContent = serializeYamlArtifact('review', reviewArtifact)
  const targetProject = context.plan.targetProject
  if (!targetProject) throw new ServiceError('Plan target project is missing.', 'CONFLICT')
  const operation = await prepareValidationAstPublish(
    {
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
      validationHash: hashFileContent(validationContent),
      reviewHash: hashFileContent(reviewContent),
      planContent,
      validationContent,
      reviewContent,
      astId: result.astId,
      astHash: result.astHash,
      contextHash: context.contextHash,
      previewHash: preview.previewHash,
      receiptHash,
      projectionHash: preview.canonicalProjection.projectionHash,
      projectionJson: JSON.stringify({
        validationNode: preview.canonicalProjection.validationNode,
        gherkin: preview.canonicalProjection.gherkin,
      }),
      validationProjectionJson: JSON.stringify(result.validation),
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
