import { createHash } from 'node:crypto'

import { z } from 'zod'

import { defaultActionCatalog } from '@/lib/action-catalog'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { canonicalStepDiscoveryText, stepDiscoveryTerms } from '@/lib/step-discovery'

import {
  coordinatorContractVersion,
  coordinatorError,
  planLinks,
  zodCoordinatorError,
} from '@/lib/coordinator-api/contracts'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'
import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import { CoordinatorProjectMismatchError } from '@/lib/coordinator-api/request-guard'
import {
  implementationValidationRunSchema,
  parseYamlArtifact,
  planArtifactSchema,
  planIdSchema,
} from '@/lib/plan-contract'
import { createOpaquePlanId } from '@/lib/plans/plan-identity'
import {
  cancelProviderWorkflowRun,
  createProviderWorkflowRun,
  getProviderWorkflowRun,
  listProviderRegistrations,
  listProviderWorkflowRuns,
  probeProviderRegistration,
  recordProviderPermissionDecision,
  updateProviderRegistration,
} from '@/services/coordinator/coordinator-provider-run-service'
import {
  acknowledgePlanEvent,
  acknowledgePlanEventsThrough,
  ensureProjectIdentity,
  ensurePlanReviewReadyEvent,
  heartbeatCoordinator,
  readPlanEvents,
  registerCoordinator,
  waitForPlanEvents,
} from '@/services/coordinator/coordinator-service'
import {
  createCoordinatorPlan,
  readCoordinatorPlan,
  reviseCoordinatorPlan,
  startCoordinatorPlan,
  updateCoordinatorTask,
} from '@/services/coordinator/coordinator-plan-service'
import {
  createContinuationPackage,
  createLifecycleSnapshot,
  createObjective,
  evaluateCoordinationSlo,
} from '@/services/coordinator/coordinator-scaling-service'
import {
  approveValidationFile,
  decideValidationNode,
  submitValidationFeedback,
  submitValidationReview,
} from '@/services/coordinator/coordinator-validation-service'
import {
  readValidationContext,
  resolveReusableValidationSteps,
} from '@/services/coordinator/validation-authoring-context-service'
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
  readImplementationLifecycleHealth,
  updateImplementationTask,
} from '@/services/coordinator/coordinator-implementation-service'
import {
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  retryBaselineAfterRepair,
  startBaselineExecution,
  startImplementation,
} from '@/services/coordinator/coordinator-baseline-service'
import { readPlanReviewSummary } from '@/services/plan-review/plan-review-service'
import { queryLocatorGraph, readLocatorGraphVisualProjection } from '@/services/locator-graph/locator-graph-service'
import { ServiceError } from '@/services/shared/errors'
import prisma from '@/config/db-config'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import { StepDefinitionExtensionService } from '@/services/step-definition/step-definition-extension-service'
import {
  coordinatorOperationRegistry,
  type CoordinatorOperationId,
} from '@/services/coordinator/coordinator-operation-registry'
import { enqueueRepositoryExport, runRepositoryExportJob } from '@/services/repository-export/repository-export-service'
import { submitDelegatedValidationAst } from '@/services/coordinator/delegated-validation-ast-service'
import {
  createDelegatedCoordinatorReceipt,
  DELEGATED_COORDINATOR_PERMISSIONS,
  readDelegatedCoordinatorReceipt,
  revokeDelegatedCoordinatorReceipt,
  verifyDelegatedCoordinatorReceipt,
} from '@/services/coordinator/delegated-coordinator-service'
import {
  abandonValidationResourceProposal,
  cleanupValidationResourceProposal,
  proposeValidationResources,
} from '@/services/coordinator/validation-resource-proposal-service'
import { reconcileManagedValidationReviewState } from '@/services/coordinator/managed-validation-review-state'
import {
  checkValidationAstForPlan,
  compileValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionPolicyForPlan,
  readValidationAstExtensionReviewsForPlan,
} from '@/services/coordinator/validation-ast-operation-service'
import {
  createStandaloneTargetTestRun,
  diagnoseTestRunEvidence,
  preflightStandaloneTargetTestRun,
  readTestRunEvidenceSummary,
} from '@/services/test-run/test-run-service'
import {
  listTargetProjects,
  registerTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from '@/services/target-project/target-project-service'
import { recordAgentPreflightReceipt } from '@/services/agent-preflight/agent-preflight-service'
import { projectLifecycleNotifications } from '@/lib/plans/plan-lifecycle-insights'
import { recordCoordinatorResponseMetric } from '@/services/coordinator/plan-observability-service'

export const runtime = 'nodejs'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const routePlanIdSchema = planIdSchema
const astReviewBindingSchema = z.object({
  operationHash: z.string().startsWith('sha256:').optional(),
  reviewStateHash: z.string().startsWith('sha256:').optional(),
  extensionArtifactHashes: z.array(z.string().startsWith('sha256:')).optional(),
})
const reviewTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan') }),
  z.object({ type: z.literal('task'), taskId: idSchema }),
  z.object({ type: z.literal('validation'), validationId: idSchema }),
  z.object({ type: z.literal('result'), resultId: idSchema }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
])
type RouteContext = { params: Promise<{ operation: string[] }> }

function serviceErrorResponse(error: unknown): Response | undefined {
  if (error instanceof CoordinatorProjectMismatchError) {
    const envelope = coordinatorError(error)!
    return Response.json({ error: envelope.message, ...envelope }, { status: 409 })
  }
  if (error instanceof ServiceError) {
    const envelope = coordinatorError(error)!
    return Response.json({ error: envelope.message, ...envelope }, { status: error.statusCode })
  }
}

function validationErrorResponse(error: unknown): Response | undefined {
  if (error instanceof z.ZodError) {
    const envelope = zodCoordinatorError(error)
    return Response.json({ error: envelope.message, ...envelope }, { status: 400 })
  }
  const envelope = coordinatorError(error)
  if (envelope) return Response.json({ error: envelope.message, ...envelope }, { status: 400 })
}

// fallow-ignore-next-line complexity
function responseError(error: unknown): Response {
  const knownResponse = serviceErrorResponse(error) ?? validationErrorResponse(error)
  if (knownResponse) {
    const envelope = coordinatorError(error)
    if (envelope?.code === 'database-unique-conflict')
      return Response.json({ error: envelope.message, ...envelope }, { status: 409 })
    return knownResponse
  }
  console.error('Coordinator API failed', error)
  return Response.json({ error: 'Coordinator API failed.' }, { status: 500 })
}

function withLinks<T extends object>(value: T, planId: string, request: Request, targetProjectId?: string | null) {
  const baseUrl = request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin
  return { ...value, links: planLinks(planId, baseUrl, targetProjectId) }
}

function assertProviderNativeRunsEnabled() {
  if (!isProviderNativeRunsEnabled()) {
    throw new ServiceError(
      'Provider-native runs are experimental and disabled. Start planning from your coding agent through Appraise MCP instead.',
      'VALIDATION',
      400,
    )
  }
}

async function getPlan(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  const plan = await readCoordinatorPlan(planId)
  return Response.json(withLinks(plan, plan.planId, request, plan.targetProjectId))
}

async function getReview(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  const review = await readPlanReviewSummary(planId)
  return Response.json(withLinks(review, review.planId, request, review.targetProjectId))
}

async function getEvents(request: Request, operation: string[]) {
  const url = new URL(request.url)
  const planId = routePlanIdSchema.parse(operation[1])
  const afterSequence = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(url.searchParams.get('after') ?? '0')
  const input = { planId, afterSequence }
  const wait = url.searchParams.get('wait') === 'true'
  const events = wait ? await waitForPlanEvents({ ...input, signal: request.signal }) : await readPlanEvents(input)
  if (wait && events.length === 0) {
    await ensurePlanReviewReadyEvent(planId)
    const repairedEvents = await readPlanEvents(input)
    if (repairedEvents.length > 0)
      return Response.json({ events: repairedEvents, notifications: projectLifecycleNotifications(repairedEvents) })
  }
  return Response.json({ events, notifications: projectLifecycleNotifications(events) })
}

async function getDiagnostic(request: Request) {
  const identity = await ensureProjectIdentity()
  const targetProjects = await listTargetProjects()
  return Response.json({
    ok: true,
    hubProject: {
      fingerprint: identity.projectFingerprint,
      canonicalPath: identity.canonicalProjectPath,
    },
    project: {
      fingerprint: identity.projectFingerprint,
      canonicalPath: identity.canonicalProjectPath,
    },
    targetProjects,
    contractVersion: coordinatorContractVersion,
    checks: [
      { id: 'application', status: 'ok', message: 'AppraiseJS application and coordinator API are reachable.' },
      { id: 'authentication', status: 'ok', message: 'Coordinator authentication succeeded.' },
      { id: 'project', status: 'ok', message: 'Coordinator project identity matches this application.' },
    ],
    warnings: [],
    recoveryActions: [],
    links: {
      application: request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin,
    },
  })
}

async function resolveEvidenceTarget(request: Request) {
  const fingerprint = request.headers.get('x-appraise-target-project')
  if (!fingerprint) throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
  const target = await resolveTargetProject(fingerprint).catch(() => null)
  if (!target) throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
  return target
}

async function getTestRunEvidence(request: Request, operation: string[]) {
  const runId = z.string().uuid().parse(operation[1])
  const target = await resolveEvidenceTarget(request)
  if (operation.length === 2) {
    return Response.json(await readTestRunEvidenceSummary(runId, target.id))
  }
  if (operation[2] === 'diagnose') {
    return Response.json(await diagnoseTestRunEvidence(runId, target.id))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// fallow-ignore-next-line complexity
async function getValidations(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  if (operation[3] === 'draft' && operation[4] === 'context') {
    const context = await readValidationContext(planId, { resourceTypes: [], limit: 1 })
    return Response.json({
      plan: context.plan,
      targetProject: context.targetProject,
      contextHash: context.contextHash,
      authoring: context.authoring,
      nextRecommendedAction: context.nextRecommendedAction,
    })
  }
  if (operation[3] === 'context') {
    const url = new URL(request.url)
    const resourceTypes = url.searchParams.get('resourceTypes')?.split(',').filter(Boolean) as
      | Array<
          | 'modules'
          | 'testSuites'
          | 'testCases'
          | 'templateSteps'
          | 'stepBlocks'
          | 'locatorGroups'
          | 'locators'
          | 'environments'
        >
      | undefined
    return Response.json(
      await readValidationContext(planId, {
        resourceTypes,
        query: url.searchParams.get('query') ?? undefined,
        limit: z.coerce.number().int().positive().max(200).catch(50).parse(url.searchParams.get('limit')),
        sinceHash: url.searchParams.get('sinceHash') ?? undefined,
      }),
    )
  }
  if (operation[3] === 'resolver') {
    const url = new URL(request.url)
    return Response.json(
      await resolveReusableValidationSteps(planId, {
        intent: z.string().trim().min(1).parse(url.searchParams.get('intent')),
        parameterNames: url.searchParams.get('parameterNames')?.split(',').filter(Boolean),
        limit: z.coerce.number().int().positive().max(25).catch(5).parse(url.searchParams.get('limit')),
      }),
    )
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

function getActionCategories(query: URLSearchParams) {
  return Response.json({
    ...defaultActionCatalog.listCategories(
      query.get('parentCategoryId') ?? undefined,
      query.get('knownCatalogHash') ?? undefined,
    ),
    deprecatedTool: true,
    replacement: 'operation_categories',
  })
}

function getActionsByReference(query: URLSearchParams) {
  return Response.json({
    catalogHash: defaultActionCatalog.catalogHash,
    actions: defaultActionCatalog.readActions(operationRefs(query)).map(withCanonicalOperation),
    deprecatedTool: true,
    replacement: 'operation_read',
  })
}

function withCanonicalOperation<T extends { id: string; version: string }>(action: T) {
  const operation = defaultOperationRegistry.read([{ id: action.id, version: action.version }])[0]!
  return {
    ...action,
    canonicalOperation: {
      id: operation.id,
      version: operation.version,
      descriptorHash: operation.descriptorHash,
    },
  }
}

function optionalQuery(query: URLSearchParams, key: string) {
  return query.get(key) ?? undefined
}

function parseDeprecatedFilter(query: URLSearchParams) {
  const value = query.get('deprecated')
  return value === null
    ? undefined
    : z
        .enum(['true', 'false'])
        .transform(option => option === 'true')
        .parse(value)
}

function parseActionCursor(query: URLSearchParams) {
  return query.has('cursor') ? z.coerce.number().int().nonnegative().parse(query.get('cursor')) : 0
}

function parseActionLimit(query: URLSearchParams) {
  return query.has('limit') ? z.coerce.number().int().min(1).max(100).parse(query.get('limit')) : 50
}

function listActions(query: URLSearchParams) {
  const filter = {
    categoryId: optionalQuery(query, 'categoryId'),
    capability: optionalQuery(query, 'capability'),
    inputType: optionalQuery(query, 'inputType'),
    runtime: z
      .enum(['browser', 'api', 'node', 'database'])
      .optional()
      .parse(query.get('runtime') ?? undefined),
    deprecated: parseDeprecatedFilter(query),
    idPrefix: optionalQuery(query, 'idPrefix'),
  }
  const result = defaultActionCatalog.listActions(filter, parseActionCursor(query), parseActionLimit(query))
  return Response.json({
    ...result,
    items: result.items.map(withCanonicalOperation),
    deprecatedTool: true,
    replacement: 'operation_search',
  })
}

async function getActions(request: Request, operation: string[]) {
  const query = new URL(request.url).searchParams
  const handlers: Record<string, () => Response> = {
    categories: () => getActionCategories(query),
    read: () => getActionsByReference(query),
    list: () => listActions(query),
  }
  return (handlers[operation[1] ?? 'list'] ?? handlers.list)()
}

function operationRefs(query: URLSearchParams) {
  return z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        context.addIssue({ code: 'custom', message: 'refs must be valid JSON.' })
        return z.NEVER
      }
    })
    .pipe(
      z
        .array(z.object({ id: z.string(), version: z.string().optional() }))
        .min(1)
        .max(50),
    )
    .parse(query.get('refs') ?? '[]')
}

function operationCategories(query: URLSearchParams) {
  if (query.get('knownManifestHash') === defaultOperationRegistry.manifestHash)
    return Response.json({ status: 'unchanged', manifestHash: defaultOperationRegistry.manifestHash, categories: [] })
  const operations = defaultOperationRegistry.list({}, 0, 100).items
  const counts = new Map<string, number>()
  operations.forEach(operation =>
    operation.categories.forEach(category => counts.set(category, (counts.get(category) ?? 0) + 1)),
  )
  return Response.json({
    status: 'current',
    manifestHash: defaultOperationRegistry.manifestHash,
    categories: [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, operationCount]) => ({ id, operationCount })),
  })
}

function operationListFilter(query: URLSearchParams) {
  return {
    category: optionalQuery(query, 'category'),
    capability: optionalQuery(query, 'capability'),
    runtime: z.enum(['browser', 'api', 'node', 'database']).optional().parse(optionalQuery(query, 'runtime')),
  }
}

type OperationSearchContext = {
  intent: string
  terms: Set<string>
  requestedParameters: Set<string>
}

function operationMatchExplanation(input: {
  exactId: boolean
  matchedAlias: string | null
  matchedTerms: string[]
  termCount: number
  matchedParameterCount: number
  requestedParameterCount: number
}) {
  if (input.exactId) return 'Exact canonical operation identity match.'
  if (input.matchedAlias)
    return `Compatibility alias ${JSON.stringify(input.matchedAlias)} resolves to this canonical operation.`
  return `Matched ${input.matchedTerms.length}/${input.termCount} intent terms and ${input.matchedParameterCount}/${input.requestedParameterCount} requested parameters.`
}

function matchBoost(exactId: boolean, matchedAlias: string | null) {
  return exactId || matchedAlias ? 100 : 0
}

function parameterCompatibility(requestedCount: number, matchedCount: number) {
  return requestedCount === 0 ? 1 : matchedCount / requestedCount
}

function operationSearchText(
  operation: ReturnType<typeof defaultOperationRegistry.list>['items'][number],
  descriptor: ReturnType<typeof defaultOperationRegistry.read>[number],
  aliases: string[],
) {
  return `${canonicalStepDiscoveryText(descriptor)} ${aliases.join(' ')}`.toLowerCase()
}

function humanStepProjection(
  projection: ReturnType<typeof defaultOperationRegistry.read>[number]['humanProjections'][number] | null,
) {
  if (!projection) return null
  return {
    name: projection.title,
    description: projection.description,
    signature: projection.signature,
    groupName: projection.group,
  }
}

function missingRequiredBindings(
  inputs: ReturnType<typeof defaultOperationRegistry.read>[number]['inputs'],
  requestedParameters: Set<string>,
) {
  return inputs
    .filter(input => input.required && !requestedParameters.has(input.name))
    .map(input => ({ name: input.name, type: input.type }))
}

function matchedIntentTerms(terms: Set<string>, text: string) {
  return [...terms].filter(term => text.includes(term))
}

function matchedInputNames(requestedParameters: Set<string>, availableParameters: Set<string>) {
  return [...requestedParameters].filter(name => availableParameters.has(name))
}

function matchingAlias(aliases: string[], intent: string) {
  return aliases.find(alias => alias.toLowerCase() === intent.toLowerCase()) ?? null
}

function activeHumanProjection(descriptor: ReturnType<typeof defaultOperationRegistry.read>[number]) {
  return descriptor.humanProjections.find(projection => !projection.deprecated) ?? null
}

function rankOperation(
  operation: ReturnType<typeof defaultOperationRegistry.list>['items'][number],
  context: OperationSearchContext,
) {
  const descriptor = defaultOperationRegistry.read([{ id: operation.id, version: operation.version }])[0]!
  const aliases = descriptor.aliases.map(alias => alias.value)
  const text = operationSearchText(operation, descriptor, aliases)
  const matchedTerms = matchedIntentTerms(context.terms, text)
  const availableParameters = new Set(descriptor.inputs.map(input => input.name))
  const matchedParameters = matchedInputNames(context.requestedParameters, availableParameters)
  const missingBindings = missingRequiredBindings(descriptor.inputs, context.requestedParameters)
  const exactId = operation.id === context.intent
  const matchedAlias = matchingAlias(aliases, context.intent)
  const humanProjection = activeHumanProjection(descriptor)
  return {
    ...operation,
    displayName: humanProjection?.title ?? operation.title,
    canonicalRef: `${operation.id}@${operation.version}`,
    agentOperation: { id: operation.id, version: operation.version, ref: `${operation.id}@${operation.version}` },
    humanStep: humanStepProjection(humanProjection),
    score: matchedTerms.length + matchedParameters.length * 2 + matchBoost(exactId, matchedAlias),
    matchedTerms,
    matchedAlias,
    parameterCompatibility: parameterCompatibility(context.requestedParameters.size, matchedParameters.length),
    missingRequiredBindings: missingBindings,
    explanation: operationMatchExplanation({
      exactId,
      matchedAlias,
      matchedTerms,
      termCount: context.terms.size,
      matchedParameterCount: matchedParameters.length,
      requestedParameterCount: context.requestedParameters.size,
    }),
  }
}

function nextOperationAction(ranked: Array<ReturnType<typeof rankOperation>>) {
  const recommended = ranked[0]
  if (!recommended) return 'Refine the query or inspect bounded operation categories before proposing custom behavior.'
  return recommended.missingRequiredBindings.length
    ? 'Resolve the recommended operation binding gaps, then call operation_read for its exact descriptor.'
    : 'Call operation_read for the selected exact version, then use its canonical reference in the Validation AST.'
}

function searchOperations(query: URLSearchParams) {
  const intent = z.string().trim().min(1).max(500).parse(query.get('query'))
  const terms = stepDiscoveryTerms(intent)
  const requestedParameters = new Set(
    (query.get('parameterNames') ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  const listing = defaultOperationRegistry.list(
    {
      ...operationListFilter(query),
      inputType: z
        .enum([
          'string',
          'number',
          'boolean',
          'json',
          'locator',
          'environment-ref',
          'stored-value-ref',
          'artifact-ref',
          'reviewed-extension-ref',
        ])
        .optional()
        .parse(optionalQuery(query, 'inputType')),
      surface: z.enum(['human', 'agent']).optional().parse(optionalQuery(query, 'surface')),
      deprecated: parseDeprecatedFilter(query),
    },
    0,
    100,
  )
  const limit = parseActionLimit(query)
  const ranked = listing.items
    .map(operation => rankOperation(operation, { intent, terms, requestedParameters }))
    .filter(operation => operation.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit)
  return Response.json({
    discoveryKind: 'combined-step',
    manifestHash: defaultOperationRegistry.manifestHash,
    query: intent,
    recommended: ranked[0] ?? null,
    recommendedStep: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    steps: ranked,
    nextRecommendedAction: nextOperationAction(ranked),
  })
}

function listOperations(query: URLSearchParams) {
  return Response.json(
    defaultOperationRegistry.list(
      {
        ...operationListFilter(query),
        surface: z.enum(['human', 'agent']).optional().parse(optionalQuery(query, 'surface')),
        deprecated: parseDeprecatedFilter(query),
        idPrefix: optionalQuery(query, 'idPrefix'),
      },
      parseActionCursor(query),
      parseActionLimit(query),
      optionalQuery(query, 'knownManifestHash'),
    ),
  )
}

function readOperations(query: URLSearchParams) {
  return Response.json({
    manifestHash: defaultOperationRegistry.manifestHash,
    operations: defaultOperationRegistry.read(operationRefs(query)),
  })
}

async function getOperations(request: Request, operation: string[]) {
  const query = new URL(request.url).searchParams
  const handlers: Record<string, () => Response> = {
    categories: () => operationCategories(query),
    read: () => readOperations(query),
    search: () => searchOperations(query),
    list: () => listOperations(query),
  }
  return (handlers[operation[1] ?? 'list'] ?? handlers.list)()
}

async function queryCoordinatorLocatorGraph(request: Request) {
  const query = new URL(request.url).searchParams
  return Response.json(
    await queryLocatorGraph({
      fromId: query.get('fromId'),
      relation: query.get('relation') ?? undefined,
      toType: query.get('toType') ?? undefined,
      cursor: query.get('cursor') ?? undefined,
      limit: z.coerce.number().int().positive().max(100).catch(25).parse(query.get('limit')),
      depth: z.coerce.number().int().positive().max(4).catch(1).parse(query.get('depth')),
    }),
  )
}

async function getLocatorGraph(request: Request, operation: string[]) {
  const handlers: Record<string, () => Promise<Response>> = {
    visual: async () => Response.json(await readLocatorGraphVisualProjection()),
    query: () => queryCoordinatorLocatorGraph(request),
  }
  return (handlers[operation[1] ?? 'query'] ?? handlers.query)()
}

const stepDefinitionRegistry = new StepDefinitionRegistryService(prisma)
const stepDefinitionExtensions = new StepDefinitionExtensionService(prisma)

// fallow-ignore-next-line complexity -- One bounded dispatcher keeps all Step Definition GET projections on the registered coordinator boundary.
async function getStepDefinitions(request: Request, operation: string[]) {
  if (operation[1] === 'search') {
    const query = new URL(request.url).searchParams
    const definitions = await stepDefinitionRegistry.list({
      status: 'ready',
      query: query.get('query') ?? undefined,
      limit: z.coerce.number().int().positive().max(25).catch(5).parse(query.get('limit')),
    })
    return Response.json({
      matches: definitions.map(item => ({
        step: { id: item.id, version: item.version, definitionHash: item.definitionHash },
        title: item.title,
        description: item.description,
        human: item.humanProjection ? JSON.parse(item.humanProjection.projectionJson) : null,
        agent: JSON.parse(item.definitionJson).agent,
        executionReadiness: item.executionBinding ? 'ready' : 'unbound',
        hashes: {
          definition: item.definitionHash,
          humanProjection: item.humanProjectionHash,
          agentContract: item.agentContractHash,
          execution: item.executionHash,
        },
      })),
      nextRecommendedAction: 'Use the returned Step Reference directly in managed authoring.',
    })
  }
  if (operation[1] === 'drafts') {
    const draftId = z.string().uuid().parse(operation[2])
    const draft = await stepDefinitionRegistry.readDraft(draftId)
    return Response.json({ ...draft, artifact: await stepDefinitionExtensions.readDraftArtifact(draftId) })
  }
  if (operation[1] === 'definitions')
    return Response.json(
      await stepDefinitionRegistry.read(z.string().min(1).parse(operation[2]), z.string().min(1).parse(operation[3])),
    )
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function dispatchGet(request: Request, operation: string[]) {
  const id = coordinatorOperationRegistry.resolve('GET', operation)
  const handlers: Partial<Record<CoordinatorOperationId, () => Promise<Response>>> = {
    'delegation-read': async () =>
      Response.json(await readDelegatedCoordinatorReceipt(z.string().uuid().parse(operation[1]))),
    diagnostic: () => getDiagnostic(request),
    'test-run-evidence': () => getTestRunEvidence(request, operation),
    'plan-health': async () =>
      Response.json(await readImplementationLifecycleHealth(routePlanIdSchema.parse(operation[1]))),
    actions: () => getActions(request, operation),
    operations: () => getOperations(request, operation),
    'step-definitions-read': () => getStepDefinitions(request, operation),
    'target-projects-list': async () => Response.json({ targetProjects: await listTargetProjects() }),
    'locator-graph': () => getLocatorGraph(request, operation),
    'providers-list': async () => {
      assertProviderNativeRunsEnabled()
      return Response.json({ providers: await listProviderRegistrations() })
    },
    'provider-runs-read': async () => {
      assertProviderNativeRunsEnabled()
      return operation.length === 1
        ? Response.json({ providerRuns: await listProviderWorkflowRuns() })
        : Response.json(await getProviderWorkflowRun(z.string().uuid().parse(operation[1])))
    },
    'plan-read': () => getPlan(request, operation),
    'plan-events-read': () => getEvents(request, operation),
    'plan-review-read': () => getReview(request, operation),
    'plan-validations-read': () => getValidations(request, operation),
    'plan-completion-read': async () =>
      Response.json(await reviewImplementationCompletion(routePlanIdSchema.parse(operation[1]))),
  }
  return handlers[id]!()
}

// Request parsing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function postImplementationOperation(operation: string[], body: unknown) {
  const planId = routePlanIdSchema.parse(operation[1])
  const action = operation[3]
  if (action === 'start') {
    return Response.json(await startImplementation(planId))
  }
  if (action === 'checkpoint') {
    const value = z
      .object({
        type: z.enum([
          'before_task',
          'after_task',
          'before_group',
          'after_group',
          'before_validation',
          'before_completion',
        ]),
        taskIds: z.array(idSchema).optional(),
        queuedFeedbackCount: z.number().int().nonnegative().optional(),
      })
      .parse(body)
    return Response.json(await reachImplementationCheckpoint({ planId, ...value }))
  }
  if (action === 'tasks') {
    const value = z
      .object({
        status: z.enum(['pending', 'in_progress', 'implemented', 'verified']),
        commitHash: z.string().min(1).optional(),
      })
      .parse(body)
    return Response.json(await updateImplementationTask({ planId, taskId: idSchema.parse(operation[4]), ...value }))
  }
  if (action === 'groups') {
    const value = z.object({ groupIds: z.array(idSchema).min(1) }).parse(body)
    return Response.json(await approveImplementationGroups({ planId, ...value }))
  }
  if (action === 'feedback') {
    const value = z
      .object({
        affectedTaskIds: z.array(idSchema).min(1),
        confirmed: z.boolean(),
        pausePlanWide: z.boolean().optional(),
      })
      .parse(body)
    return Response.json(await applyBlockingFeedback({ planId, ...value }))
  }
  if (action === 'control') {
    const value = z
      .object({
        action: z.enum(['pause', 'resume', 'cancel']),
        stopActiveRuns: z.boolean().optional(),
      })
      .parse(body)
    return Response.json(await controlImplementation({ planId, ...value }))
  }
  if (action === 'validations') {
    if (operation[4] === 'start') {
      const value = z
        .object({ validationIds: z.array(idSchema).optional(), commitHash: z.string().min(1).optional() })
        .parse(body)
      return Response.json(await startImplementationValidation({ planId, ...value }))
    }
    if (operation[4] === 'reconcile') {
      const value = z
        .object({
          runIds: z.array(idSchema).optional(),
          verifyTaskIds: z.array(idSchema).optional(),
          idempotencyKey: z.string().min(1).optional(),
        })
        .refine(input => Boolean(input.verifyTaskIds) === Boolean(input.idempotencyKey), {
          message: 'verifyTaskIds and idempotencyKey must be provided together.',
        })
        .parse(body)
      return Response.json(await reconcileImplementationValidation({ planId, ...value }))
    }
    const value = z
      .object({
        run: implementationValidationRunSchema,
      })
      .parse(body)
    return Response.json(await recordImplementationValidation({ planId, ...value }))
  }
  if (action === 'complete') {
    const value = z.object({ approvedBy: z.string().min(1), contentHash: z.string().startsWith('sha256:') }).parse(body)
    return Response.json(await approveImplementationCompletion({ planId, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// Baseline actions are thin coordinator API wrappers around the lifecycle-owned service.
// fallow-ignore-next-line complexity
async function postBaselineOperation(operation: string[], body: unknown) {
  const planId = routePlanIdSchema.parse(operation[1])
  const action = operation[3]
  if (action === 'start') return Response.json(await startBaselineExecution(planId))
  if (action === 'reconcile') return Response.json(await reconcileBaselineExecution(planId))
  if (action === 'cancel') return Response.json(await cancelBaselineExecution(planId))
  if (action === 'retry') {
    const value = z
      .object({ reason: z.string().trim().min(1), expectedValidationHash: z.string().startsWith('sha256:') })
      .parse(body)
    return Response.json(await retryBaselineAfterRepair({ planId, ...value }))
  }
  if (action === 'accept') return Response.json(await acceptBaseline(planId))
  if (action === 'failures' && operation[5] === 'acknowledge') {
    const value = z.object({ acknowledgedBy: z.string().min(1) }).parse(body)
    return Response.json(
      await acknowledgeBaselineFailure({
        planId,
        attemptId: idSchema.parse(operation[4]),
        acknowledgedBy: value.acknowledgedBy,
      }),
    )
  }
  if (action === 'regressions' && operation[5] === 'justify') {
    const value = z.object({ justification: z.string().trim().min(1) }).parse(body)
    return Response.json(
      await justifyBaselineRegressionPass({
        planId,
        attemptId: idSchema.parse(operation[4]),
        justification: value.justification,
      }),
    )
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await guardCoordinatorRequest(request)
    return await dispatchGet(request, (await context.params).operation)
  } catch (error) {
    return responseError(error)
  }
}

async function postRegister(body: unknown) {
  const input = z
    .object({
      planId: routePlanIdSchema,
      coordinatorId: z.string().min(1),
      reconnectConnectionId: z.string().uuid().optional(),
      takeoverApproved: z.boolean().optional(),
    })
    .parse(body)
  return Response.json(await registerCoordinator(input))
}

async function postHeartbeat(body: unknown) {
  const input = z
    .object({ planId: routePlanIdSchema, coordinatorId: z.string().min(1), connectionId: z.string().uuid() })
    .parse(body)
  return Response.json(await heartbeatCoordinator(input))
}

const createPlanArtifactSchema = planArtifactSchema.omit({ planId: true }).extend({ planId: planIdSchema.optional() })
const createPlanBodySchema = z.object({
  plan: z.union([createPlanArtifactSchema, z.string()]),
  target: z.string().min(1).optional(),
  source: z
    .object({
      path: z.string().min(1),
      external: z.boolean(),
      warning: z.string().optional(),
    })
    .optional(),
  delegation: z
    .object({ receipt: z.unknown(), delegatedCoordinatorId: z.string().min(1), operationKey: z.string().min(1) })
    .optional(),
})

function parseCreatePlanBody(body: unknown) {
  const value = createPlanBodySchema.parse(body)
  const plan =
    typeof value.plan === 'string'
      ? (parseYamlArtifact('plan', value.plan) as z.infer<typeof planArtifactSchema>)
      : planArtifactSchema.parse({ ...value.plan, planId: value.plan.planId ?? createOpaquePlanId() })
  return { ...value, plan }
}

function sourceResponse(source: z.infer<typeof createPlanBodySchema>['source']) {
  if (!source) return {}
  return {
    source,
    ...(source.external
      ? { warnings: ['Plan source is outside the coordinator project and was explicitly allowed.'] }
      : {}),
  }
}

// fallow-ignore-next-line complexity
async function postCreatePlan(request: Request, body: unknown) {
  const value = parseCreatePlanBody(body)
  const identity = await ensureProjectIdentity()
  const targetProject = value.target ? await resolveTargetProject(value.target) : undefined
  await authorizeDelegatedPlanCreation(value.delegation, targetProject)
  const createdPlan = await createCoordinatorPlan(value.plan, { targetProjectId: targetProject?.id })
  return Response.json(
    {
      ...withLinks(createdPlan, createdPlan.planId, request, targetProject?.id),
      hubProject: {
        fingerprint: identity.projectFingerprint,
        canonicalPath: identity.canonicalProjectPath,
      },
      coordinatorProject: {
        fingerprint: identity.projectFingerprint,
        canonicalPath: identity.canonicalProjectPath,
      },
      ...(targetProject ? { targetProject } : {}),
      ...sourceResponse(value.source),
    },
    { status: 201 },
  )
}

async function authorizeDelegatedPlanCreation(
  delegation: z.infer<typeof createPlanBodySchema>['delegation'],
  targetProject: Awaited<ReturnType<typeof resolveTargetProject>> | undefined,
) {
  if (!delegation) return
  if (!targetProject) throw new ServiceError('Delegated plan creation requires a registered target.', 'VALIDATION')
  await verifyDelegatedCoordinatorReceipt({
    receipt: delegation.receipt,
    delegatedCoordinatorId: delegation.delegatedCoordinatorId,
    operationKey: delegation.operationKey,
    targetFingerprint: targetProject.fingerprint,
    pathFingerprint: `sha256:${createHash('sha256').update(targetProject.canonicalPath).digest('hex')}`,
    permission: 'plan_create',
    briefOrPlanHash: undefined,
  })
}

async function postTargetProject(body: unknown) {
  const value = z.object({ path: z.string().min(1), displayName: z.string().min(1).optional() }).parse(body)
  const identity = await ensureProjectIdentity()
  const targetProject = await registerTargetProject({ projectPath: value.path, displayName: value.displayName })
  return Response.json(
    {
      targetProject,
      marker: await writeTargetProjectMarker(targetProject, identity.projectFingerprint),
    },
    { status: 201 },
  )
}

async function postStandaloneTestRun(body: unknown) {
  const value = z
    .object({
      target: z.string().min(1),
      environmentId: z.string().min(1),
      name: z.string().min(1).optional(),
      tagExpression: z.string().optional(),
      testWorkersCount: z.number().int().positive().optional(),
      browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
      planId: planIdSchema.optional(),
      validationId: idSchema.optional(),
      implementationValidationRunId: idSchema.optional(),
      featurePaths: z.array(z.string().min(1)).optional(),
      importPaths: z.array(z.string().min(1)).optional(),
      supportPaths: z.array(z.string().min(1)).optional(),
      prepareWorkspace: z.boolean().optional(),
      expectedTestCases: z.array(z.object({ testCaseId: idSchema, testSuiteId: idSchema.nullish() })).optional(),
    })
    .superRefine((input, context) => {
      if (input.planId && input.expectedTestCases?.some(link => !link.testSuiteId)) {
        context.addIssue({
          code: 'custom',
          path: ['expectedTestCases'],
          message: 'Plan-bound expected test cases require a testSuiteId.',
        })
      }
    })
    .parse(body)
  return Response.json(await createStandaloneTargetTestRun(value), { status: 201 })
}

async function postTestRunPreflight(body: unknown) {
  const value = z
    .object({
      target: z.string().min(1).optional(),
      environmentId: z.string().min(1).optional(),
      planId: planIdSchema.optional(),
      validationId: idSchema.optional(),
      featurePaths: z.array(z.string().min(1)).optional(),
      importPaths: z.array(z.string().min(1)).optional(),
      supportPaths: z.array(z.string().min(1)).optional(),
    })
    .parse(body)
  return Response.json(await preflightStandaloneTargetTestRun(value))
}

async function postProviderRegistration(operation: string[], body: unknown) {
  const providerKey = z.string().min(1).parse(operation[1])
  if (operation[2] === 'probe') return Response.json(await probeProviderRegistration(providerKey))
  if (operation[2] === 'update') {
    const value = z
      .object({
        executablePath: z.string().trim().nullable().optional(),
        defaultProfile: z.string().trim().nullable().optional(),
        defaultModel: z.string().trim().nullable().optional(),
        enabled: z.boolean().optional(),
        launchEnabled: z.boolean().optional(),
        settings: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(body)
    return Response.json(await updateProviderRegistration({ providerKey, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postProviderRun(operation: string[], body: unknown) {
  if (operation.length === 1) {
    const value = z
      .object({
        targetProjectId: z.string().uuid(),
        planId: routePlanIdSchema.optional(),
        providerKey: z.string().min(1).optional(),
        providerProfile: z.string().min(1).optional(),
        launchPrompt: z.string().trim().min(1),
      })
      .parse(body)
    return Response.json(await createProviderWorkflowRun({ ...value, approvedScope: { mode: 'planning_only' } }), {
      status: 201,
    })
  }
  const runId = z.string().uuid().parse(operation[1])
  if (operation[2] === 'cancel') return Response.json(await cancelProviderWorkflowRun(runId))
  if (operation[2] === 'permissions') {
    const value = z
      .object({
        requestId: z.string().min(1),
        decision: z.enum(['approved', 'denied']),
        riskTier: z.string().min(1),
        requestedScope: z.string().min(1),
        payload: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().optional(),
        decidedBy: z.string().min(1),
      })
      .parse(body)
    return Response.json(await recordProviderPermissionDecision({ runId, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postStartPlan(operation: string[]) {
  return Response.json(await startCoordinatorPlan(routePlanIdSchema.parse(operation[1])))
}

async function postTaskUpdate(operation: string[], body: unknown) {
  const value = z.object({ status: z.string().min(1), detail: z.string().optional() }).parse(body)
  return Response.json(
    await updateCoordinatorTask({
      planId: routePlanIdSchema.parse(operation[1]),
      taskId: idSchema.parse(operation[3]),
      ...value,
    }),
  )
}

async function postEventAcknowledgement(operation: string[], body: unknown) {
  const value = z
    .object({
      sequence: z.number().int().positive().optional(),
      acknowledgeThroughSequence: z.number().int().positive().optional(),
      coordinatorId: z.string().min(1),
    })
    .refine(input => (input.sequence === undefined) !== (input.acknowledgeThroughSequence === undefined), {
      message: 'Provide exactly one event acknowledgement sequence.',
    })
    .parse(body)
  const planId = routePlanIdSchema.parse(operation[1])
  if (value.acknowledgeThroughSequence !== undefined) {
    return Response.json(
      await acknowledgePlanEventsThrough({
        planId,
        sequence: value.acknowledgeThroughSequence,
        coordinatorId: value.coordinatorId,
      }),
    )
  }
  return Response.json(
    await acknowledgePlanEvent({ planId, sequence: value.sequence!, coordinatorId: value.coordinatorId }),
  )
}

// Request parsing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function postValidationOperation(request: Request, operation: string[], body: unknown) {
  const planId = routePlanIdSchema.parse(operation[1])
  if (operation[3] === 'resources' && operation[4] === 'propose')
    return Response.json(await proposeValidationResources({ planId, proposal: body }))
  if (operation[3] === 'resources' && operation[4] === 'abandon') {
    const value = z.object({ idempotencyKey: idSchema, reason: z.string().trim().min(1) }).parse(body)
    return Response.json(await abandonValidationResourceProposal({ planId, ...value }))
  }
  if (operation[3] === 'resources' && operation[4] === 'cleanup') {
    const value = z.object({ idempotencyKey: idSchema }).parse(body)
    return Response.json(await cleanupValidationResourceProposal({ planId, ...value }))
  }
  if (operation[3] === 'ast') {
    if (operation[4] === 'extension-policy') return Response.json(await readValidationAstExtensionPolicyForPlan(planId))
    if (operation[4] === 'extension-reviews') {
      const value = z.object({ operationId: z.string().optional() }).parse(body)
      return Response.json(await readValidationAstExtensionReviewsForPlan(planId, value.operationId))
    }
    const value = z
      .object({ submission: z.unknown(), expectedReceiptHash: z.string().startsWith('sha256:').optional() })
      .parse(body)
    if (operation[4] === 'check') return Response.json(await checkValidationAstForPlan(planId, value.submission))
    if (operation[4] === 'preview') return Response.json(await previewValidationAstForPlan(planId, value.submission))
    if (operation[4] === 'compile' && value.expectedReceiptHash)
      return Response.json(
        await compileValidationAstForPlan({
          planId,
          submission: value.submission,
          expectedReceiptHash: value.expectedReceiptHash,
        }),
      )
    throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  }
  if (operation[3] === 'draft' || operation[3] === 'publish')
    throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  if (operation[3] === 'feedback') {
    const value = z
      .object({
        scope: z.enum(['test_artifact', 'product_scope']),
        target: reviewTargetSchema,
        body: z.string().trim().min(1),
        actor: z.string().min(1).optional(),
        affectedValidationIds: z.array(idSchema).optional(),
        affectedFilePaths: z.array(z.string().min(1)).optional(),
      })
      .parse(body)
    return Response.json(await submitValidationFeedback({ planId, ...value }))
  }
  if (operation[3] === 'submit') {
    const binding = astReviewBindingSchema.parse(body)
    return Response.json(await submitValidationReview(planId, binding))
  }
  if (operation[3] === 'reconcile') return Response.json(await reconcileManagedValidationReviewState(planId))
  if (operation[3] === 'nodes') {
    const value = astReviewBindingSchema
      .extend({
        decision: z.enum(['approved', 'rejected', 'deferred']),
        decidedBy: z.string().min(1),
      })
      .parse(body)
    return Response.json(await decideValidationNode({ planId, validationId: idSchema.parse(operation[4]), ...value }))
  }
  if (operation[3] === 'files') {
    const value = z
      .object({ path: z.string().min(1), contentHash: z.string().startsWith('sha256:'), approvedBy: z.string().min(1) })
      .parse(body)
    return Response.json(await approveValidationFile({ planId, ...value }))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function postDelegationCreate(body: unknown) {
  const value = z
    .object({
      parentCoordinatorId: z.string().min(1),
      delegatedCoordinatorId: z.string().min(1),
      targetProjectId: z.string().min(1).optional(),
      targetFingerprint: z.string().startsWith('sha256:'),
      pathFingerprint: z.string().startsWith('sha256:'),
      purpose: z.string().min(1),
      permissions: z.array(z.enum(DELEGATED_COORDINATOR_PERMISSIONS)).min(1),
      prohibitions: z.array(z.string().min(1)).optional(),
      briefOrPlanHash: z.string().startsWith('sha256:').optional(),
      expiresAt: z.string().datetime({ offset: true }),
    })
    .parse(body)
  return Response.json(await createDelegatedCoordinatorReceipt(value), { status: 201 })
}

async function postDelegationRevoke(operation: string[], body: unknown) {
  const value = z.object({ revokedBy: z.string().min(1), reason: z.string().min(1).optional() }).parse(body)
  return Response.json(await revokeDelegatedCoordinatorReceipt({ id: z.string().uuid().parse(operation[1]), ...value }))
}

async function postObjective(body: unknown) {
  const value = z
    .object({
      objectiveId: idSchema.optional(),
      title: z.string().min(1),
      milestones: z.array(z.object({ id: idSchema, title: z.string().min(1) })),
      plans: z.array(
        z.object({
          planId: routePlanIdSchema,
          milestoneId: idSchema,
          dependsOn: z.array(routePlanIdSchema).optional(),
          impactedPaths: z.array(z.string().min(1)).optional(),
        }),
      ),
    })
    .parse(body)
  return Response.json(await createObjective(value))
}

function postCoordinationSlo(body: unknown) {
  const value = z
    .object({
      phases: z.array(
        z.object({
          phase: z.string().min(1),
          activeAppraiseMs: z.number().int().nonnegative(),
          activeAgentMs: z.number().int().nonnegative(),
          humanReviewMs: z.number().int().nonnegative(),
        }),
      ),
      responseBytes: z.array(z.number().int().nonnegative()),
      operations: z.number().int().nonnegative(),
      retries: z.number().int().nonnegative(),
      approvals: z.number().int().nonnegative(),
    })
    .parse(body)
  return Response.json(evaluateCoordinationSlo(value))
}

async function postRepositoryExport(operation: string[], body: unknown) {
  if (operation.length === 1) {
    const value = z
      .object({
        publishOperationId: z.string().min(1),
        policy: z.enum(['disabled', 'optional', 'required']),
        destinationPath: z.string().min(1).optional(),
      })
      .parse(body)
    return Response.json(await enqueueRepositoryExport(value))
  }
  const value = z.object({ allowReplaceConflicts: z.boolean().optional() }).parse(body)
  return Response.json(
    await runRepositoryExportJob(z.string().uuid().parse(operation[1]), {
      allowReplaceConflicts: value.allowReplaceConflicts,
    }),
  )
}

async function postDelegatedValidation(request: Request, body: unknown) {
  const value = z.object({ submission: z.unknown(), receipt: z.unknown() }).parse(body)
  return Response.json(
    await submitDelegatedValidationAst({
      submission: value.submission,
      receipt: value.receipt,
      targetFingerprint: request.headers.get('x-appraise-project') ?? '',
    }),
  )
}

async function postPlanSnapshot(operation: string[], body: unknown) {
  const value = z.object({ archiveThroughSequence: z.number().int().nonnegative().optional() }).parse(body)
  return Response.json(
    await createLifecycleSnapshot(routePlanIdSchema.parse(operation[1]), {
      archiveThroughSequence: value.archiveThroughSequence,
    }),
  )
}

async function postPlanContinuation(operation: string[], body: unknown) {
  const value = z
    .object({
      narrative: z.string(),
      references: z.array(z.string().min(1)).optional(),
      objectiveReference: z.string().min(1).optional(),
    })
    .parse(body)
  return Response.json(await createContinuationPackage({ planId: routePlanIdSchema.parse(operation[1]), ...value }))
}

async function postDiagnosticPreflight(request: Request, body: unknown) {
  const receipt = await recordAgentPreflightReceipt(body)
  const baseUrl = request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin
  const query = new URLSearchParams({ preflight: receipt.id })
  if (receipt.targetProjectId) query.set('project', receipt.targetProjectId)
  return Response.json({
    id: receipt.id,
    status: receipt.status,
    snapshotHash: receipt.snapshotHash,
    observedAt: receipt.observedAt,
    browserUrl: `${baseUrl}/projects?${query}`,
  })
}

// fallow-ignore-next-line complexity -- One explicit dispatcher makes every registered draft transition auditable and rejects unknown operations.
async function postStepDefinitions(operation: string[], body: unknown) {
  if (operation[1] === 'drafts' && operation.length === 2)
    return Response.json(await stepDefinitionRegistry.createDraft(body), { status: 201 })
  if (operation[1] === 'drafts') {
    const draftId = z.string().uuid().parse(operation[2])
    const action = operation[3]
    const input = z.object({ expectedRevision: z.number().int().positive() }).passthrough().parse(body)
    if (action === 'update')
      return Response.json(await stepDefinitionRegistry.updateDraft(draftId, input.expectedRevision, input.definition))
    if (action === 'delete') {
      await stepDefinitionRegistry.deleteDraft(draftId, input.expectedRevision)
      return Response.json({ draftId, deleted: true })
    }
    if (action === 'validate') return Response.json(await stepDefinitionRegistry.validateDraft(draftId))
    if (action === 'preview') return Response.json(await stepDefinitionRegistry.previewDraft(draftId))
    if (action === 'review')
      return Response.json(
        await stepDefinitionRegistry.submitForReview(
          draftId,
          input.expectedRevision,
          z.string().min(1).parse(input.reviewAuthority),
        ),
      )
    if (action === 'publish')
      return Response.json(
        await stepDefinitionRegistry.publishDraft({
          draftId,
          expectedRevision: input.expectedRevision,
          conformanceRunId: z.string().min(1).parse(input.conformanceRunId),
        }),
      )
    if (action === 'artifact')
      return Response.json(
        await stepDefinitionExtensions.saveDraftArtifact(draftId, input.expectedRevision, input.artifact),
      )
    if (action === 'compile')
      return Response.json(await stepDefinitionExtensions.compileDraftArtifact(draftId, input.expectedRevision))
  }
  if (operation[1] === 'definitions') {
    const stepId = z.string().min(1).parse(operation[2])
    const version = z.string().min(1).parse(operation[3])
    const action = operation[4]
    if (action === 'deprecate')
      return Response.json(
        await stepDefinitionRegistry.deprecate({
          stepId,
          version,
          ...z
            .object({
              reason: z.string().min(1),
              actor: z.string().min(1),
              replacement: z.object({ id: z.string(), version: z.string() }).optional(),
            })
            .parse(body),
        }),
      )
    if (action === 'version')
      return Response.json(
        await stepDefinitionRegistry.createVersionDraft({
          stepId,
          version,
          ...z.object({ newVersion: z.string(), createdBy: z.string().min(1) }).parse(body),
        }),
      )
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

async function dispatchPost(request: Request, operation: string[], body: unknown) {
  const id = coordinatorOperationRegistry.resolve('POST', operation)
  const handlers: Partial<Record<CoordinatorOperationId, () => Promise<Response>>> = {
    'delegation-create': () => postDelegationCreate(body),
    'step-definitions-write': () => postStepDefinitions(operation, body),
    'delegation-revoke': () => postDelegationRevoke(operation, body),
    'objective-create': () => postObjective(body),
    'coordination-slo': async () => postCoordinationSlo(body),
    'diagnostic-preflight-write': () => postDiagnosticPreflight(request, body),
    'repository-export': () => postRepositoryExport(operation, body),
    'delegated-validation-submit': () => postDelegatedValidation(request, body),
    'provider-runs-write': () => {
      assertProviderNativeRunsEnabled()
      return postProviderRun(operation, body)
    },
    'plan-snapshot': () => postPlanSnapshot(operation, body),
    'plan-continuation': () => postPlanContinuation(operation, body),
    'providers-write': () => {
      assertProviderNativeRunsEnabled()
      return postProviderRegistration(operation, body)
    },
    register: () => postRegister(body),
    heartbeat: () => postHeartbeat(body),
    'plan-create': () => postCreatePlan(request, body),
    'target-project-write': () => postTargetProject(body),
    'test-run-write': () => (operation[1] === 'preflight' ? postTestRunPreflight(body) : postStandaloneTestRun(body)),
    'plan-start': () => postStartPlan(operation),
    'plan-task-update': () => postTaskUpdate(operation, body),
    'plan-event-acknowledge': () => postEventAcknowledgement(operation, body),
    'plan-validation-write': () => postValidationOperation(request, operation, body),
    'plan-baseline-write': () => postBaselineOperation(operation, body),
    'plan-implementation-write': () => postImplementationOperation(operation, body),
  }
  return handlers[id]!()
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = Date.now()
  let operation: string[] = []
  let body: unknown
  try {
    operation = (await context.params).operation
    body = await readCoordinatorJson(request)
    await guardPostRequest(request, operation, body)
    const response = await dispatchPost(request, operation, body)
    await recordCoordinatorResponseMetric({ operation, body, response, startedAt }).catch(error =>
      console.warn('Plan operation telemetry could not be recorded.', error),
    )
    return response
  } catch (error) {
    const response = responseError(error)
    await recordCoordinatorResponseMetric({ operation, body, response, startedAt }).catch(error =>
      console.warn('Plan operation telemetry could not be recorded.', error),
    )
    return response
  }
}

async function guardPostRequest(request: Request, operation: string[], body: unknown) {
  try {
    await guardCoordinatorRequest(request)
  } catch (error) {
    if (!isDelegatedPlanCreate(operation, body)) throw error
  }
}

// This fail-closed predicate is deliberately explicit because it is the only coordinator-auth bypass.
// fallow-ignore-next-line complexity
function isDelegatedPlanCreate(operation: string[], body: unknown): boolean {
  return (
    operation.length === 1 &&
    operation[0] === 'plans' &&
    typeof body === 'object' &&
    body !== null &&
    'delegation' in body
  )
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await guardCoordinatorRequest(request)
    const operation = (await context.params).operation
    coordinatorOperationRegistry.resolve('PUT', operation)
    const body = z
      .object({ plan: planArtifactSchema, expectedHash: z.string().startsWith('sha256:') })
      .parse(await readCoordinatorJson(request))
    const planId = routePlanIdSchema.parse(operation[1])
    const revised = await reviseCoordinatorPlan(planId, body.plan, body.expectedHash)
    return Response.json(withLinks(revised, revised.planId, request, revised.targetProjectId))
  } catch (error) {
    return responseError(error)
  }
}
