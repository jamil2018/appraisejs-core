import { assertQualityJourneyCutoverRoute } from '@/services/coordinator/quality-journey-cutover-policy'
import { createHash, randomUUID } from 'node:crypto'

import { CredentialExecutionAuthorizationIssuer } from '@prisma/client'
import { z } from 'zod'
import {
  isSpecializedAnalysisLifecycleCommand,
  journeyCommandSchema,
  qualityJourneyRoleSchema,
} from '@/lib/quality-journey'

import prisma from '@/config/db-config'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { coordinatorOperationRegistry } from '@/services/coordinator/coordinator-operation-registry'
import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import {
  readLocatorGraphVisualProjection,
  queryLocatorGraph,
  searchLocatorGraph,
} from '@/services/locator-graph/locator-graph-service'
import { ensureTargetLocator } from '@/services/coordinator/locator-ensure-service'
import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import { coordinatorStepDefinitionService } from '@/services/coordinator/coordinator-step-definition-service'
import {
  answerQualityRequirementQueries,
  createQualityAssessment,
  createQualityAssessmentSuccessor,
  decideQualityAssessment,
  readQualityAssessment,
  readQualityRequirementGraph,
  submitQualityRequirementSource,
} from '@/services/coordinator/quality-design-service'
import {
  decideExecutionConsent,
  decideRequirementAnalysis,
  decideValidationDesign,
  listQualityMethodologies,
  proposeRequirementAnalysis,
  proposeValidationDesign,
  readQualityMethodology,
  readRequirementAnalysis,
  readValidationDesign,
  recordAssessmentFinding,
  revokeExecutionConsent,
} from '@/services/coordinator/quality-operating-system-service'
import {
  preflightQualityAssessmentRun,
  prepareQualityAssessmentRun,
} from '@/services/coordinator/assessment-preparation-service'
import {
  createRemoteEvaluationScope,
  createRemoteEvaluationScopePartition,
  readRemoteEvaluationScope,
} from '@/services/coordinator/remote-evaluation-scope-service'
import {
  reconcileQualityAssessment,
  runQualityAssessment,
  stopQualityAssessment,
} from '@/services/coordinator/assessment-execution-service'
import { ServiceError } from '@/services/shared/errors'
import {
  issueHostAssertionGrant,
  revokeCredentialExecutionGrant,
} from '@/services/coordinator/credential-execution-authorization-service'
import {
  ensureEnvironment,
  environmentRegistryHash,
  environmentSummary,
  listEnvironments,
} from '@/services/environment/environment-service'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'
import { recordAgentPreflightReceipt } from '@/services/agent-preflight/agent-preflight-service'
import {
  initializeTargetGitRepository,
  listTargetProjects,
  registerTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from '@/services/target-project/target-project-service'
import {
  createIndependentAuthoredCapsuleTestRun,
  diagnoseTestRunEvidence,
  readTestRunEvidenceSummary,
} from '@/services/test-run/test-run-service'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import {
  claimQualityJourneyWork,
  cancelQualityJourneyWork,
  completeQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  inspectQualityJourneyFactoryEvidence,
  listQualityJourneyArtifacts,
  revokeQualityJourneyWorkAuthorization,
  resumeQualityJourney,
  submitDurableQualityJourneyCommand,
} from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyAnalysisRoute, postQualityJourneyAnalysisRoute } from './quality-journey-analysis-route'
import { getQualityJourneyDiscoveryRoute, postQualityJourneyDiscoveryRoute } from './quality-journey-discovery-route'
import { getQualityJourneyScenarioRoute, postQualityJourneyScenarioRoute } from './quality-journey-scenario-route'
import { getQualityJourneyAutomationRoute, postQualityJourneyAutomationRoute } from './quality-journey-automation-route'
import { getQualityJourneyExecutionRoute, postQualityJourneyExecutionRoute } from './quality-journey-execution-route'
import { getQualityJourneyTriageRoute, postQualityJourneyTriageRoute } from './quality-journey-triage-route'
import { getQualityJourneyLibraryRoute } from './quality-journey-library-route'
import { getQualityJourneyCompatibilityRoute } from './quality-journey-compatibility-route'

export const runtime = 'nodejs'

const qualityReviewDecisionSchema = z.object({
  expectedContentHash: z.string().startsWith('sha256:'),
  decision: z.enum(['APPROVED', 'NEEDS_REVISION', 'REJECTED']),
  decidedBy: z.string().min(1),
  rationale: z.string().min(1),
})

function qualityReviewDecisionInput(value: z.infer<typeof qualityReviewDecisionSchema>) {
  return { decision: value.decision, decidedBy: value.decidedBy, rationale: value.rationale }
}

type RouteContext = { params: Promise<{ operation: string[] }> }

type CoordinatorErrorContext = {
  operation: string
  idempotencyKey?: string
}

function bodyRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function coordinatorErrorContext(request: Request, operation: string[], body?: unknown): CoordinatorErrorContext {
  const source = bodyRecord(body)
  const header = request.headers.get('idempotency-key')
  const idempotencyKey = header ?? (typeof source?.idempotencyKey === 'string' ? source.idempotencyKey : undefined)
  return {
    operation: operation.join('/') || 'unknown',
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}

function assertPlanMatchesTarget(plan: { targetProjectId: string }, target: { id: string; fingerprint: string }): void {
  if (plan.targetProjectId !== target.id)
    throw new ServiceError('Quality Plan not found for the requested target.', 'NOT_FOUND')
}

function unknownOperation(): never {
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

function errorClassification(error: unknown) {
  if (error instanceof z.ZodError) return 'request_invalid' as const
  if (error instanceof ServiceError) {
    if (error.code === 'VALIDATION') return 'request_invalid' as const
    if (error.code === 'UNAUTHORIZED') return 'authorization_failure' as const
    if (error.code === 'NOT_FOUND') return 'resource_missing' as const
    if (error.code === 'CONFLICT') return 'state_conflict' as const
  }
  return 'appraise_runtime_defect' as const
}

function recoveryRetry(error: ServiceError | undefined) {
  if (error?.details?.code === 'assessment_execution_terminal')
    return {
      safe: false,
      strategy: 'do_not_retry' as const,
      nextAction: {
        tool: 'assessment_create_successor',
        reason:
          'The existing Assessment has terminal execution history and cannot receive another one-use consent. Create an immutable successor, then prepare it with a newly generated idempotencyKey.',
      },
    }
  if (
    error?.details?.code === 'assessment_execution_reserved' ||
    error?.details?.code === 'assessment_execution_incomplete'
  )
    return {
      safe: false,
      strategy: 'read_state_then_retry' as const,
      nextAction: {
        tool: 'assessment_reconcile',
        reason:
          'This Assessment still has active or unsealed execution work. Wait for it to become terminal, then read or reconcile before starting any new preparation.',
      },
    }
  return { safe: false, strategy: 'do_not_retry' as const }
}

const authorizationHandoffSchema = z
  .object({
    executionRequestId: z.string().uuid(),
    expectedRequestHash: z.string().startsWith('sha256:'),
    expiresAt: z.string().datetime(),
    authorizationRequestCreated: z.literal(true),
    nextAction: z
      .object({
        tool: z.literal('assessment_prepare_run'),
        reason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  })
  .strict()

function authorizationHandoff(error: ServiceError | undefined) {
  if (error?.code !== 'UNAUTHORIZED' || error.message !== 'AUTHORIZATION_REQUIRED') return undefined
  const parsed = authorizationHandoffSchema.safeParse(error.details?.authorization)
  return parsed.success ? parsed.data : undefined
}

const executionConsentDetailsSchema = z
  .object({
    assessmentId: z.string().min(1),
    consentId: z.string().uuid(),
    executionManifestHash: z.string().startsWith('sha256:'),
    consentStatus: z.literal('REQUESTED'),
    consentRequestCreated: z.literal(true),
  })
  .passthrough()

function executionConsentHandoff(error: ServiceError | undefined) {
  if (error?.code !== 'CONFLICT' || error.message !== 'Explicit execution consent is required.') return undefined
  const parsed = executionConsentDetailsSchema.safeParse(error.details)
  if (!parsed.success) return undefined
  const arguments_ = {
    assessmentId: parsed.data.assessmentId,
    consentId: parsed.data.consentId,
    expectedExecutionManifestHash: parsed.data.executionManifestHash,
  }
  return {
    ...arguments_,
    consentRequestCreated: true as const,
    nextAction: {
      tool: 'execution_consent_decide' as const,
      arguments: arguments_,
      reason:
        'The manifest-bound execution consent request is committed. Grant or revoke it explicitly; after a grant, replay the original compact preparation with the same idempotencyKey and returned consent identity.',
    },
  }
}

function responseError(error: unknown, context: CoordinatorErrorContext) {
  const serviceError = error instanceof ServiceError ? error : undefined
  const authorization = authorizationHandoff(serviceError)
  const executionConsent = executionConsentHandoff(serviceError)
  const status = error instanceof z.ZodError ? 400 : (serviceError?.statusCode ?? 500)
  const message =
    error instanceof z.ZodError
      ? 'Coordinator request failed validation.'
      : (serviceError?.message ?? 'Coordinator API failed.')
  return Response.json(
    {
      schema: 'appraise.error/v1',
      errorId: randomUUID(),
      occurredAt: new Date().toISOString(),
      classification: errorClassification(error),
      code: authorization
        ? 'AUTHORIZATION_REQUIRED'
        : (serviceError?.code ?? (error instanceof z.ZodError ? 'VALIDATION' : 'INTERNAL')),
      message,
      httpStatus: status,
      operation: {
        name: context.operation,
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      },
      operationOutcome: authorization || executionConsent ? 'committed' : 'not_started',
      targetOutcome: 'not_evaluated',
      retry:
        authorization || executionConsent
          ? {
              safe: false,
              strategy: 'read_state_then_retry',
              nextAction: (authorization ?? executionConsent)!.nextAction,
            }
          : recoveryRetry(serviceError),
      ...(authorization
        ? {
            durableState: 'authorization_request_committed',
            authorization,
          }
        : {}),
      ...(executionConsent
        ? {
            durableState: 'execution_consent_request_committed',
            executionConsent,
          }
        : {}),
      ...(error instanceof z.ZodError
        ? {
            details: {
              issues: error.issues.map(issue => ({
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message,
              })),
            },
          }
        : {}),
      ...(!serviceError && !(error instanceof z.ZodError)
        ? { details: { cause: error instanceof Error ? error.message : String(error) } }
        : {}),
      ...(serviceError?.details ? { details: serviceError.details } : {}),
    },
    { status },
  )
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

function readCatalogOperations(refs: Array<{ id: string; version?: string }>) {
  try {
    return defaultOperationRegistry.read(refs)
  } catch (error) {
    if (error instanceof Error && /Operation ".+" was not found\./.test(error.message)) {
      throw new ServiceError(error.message, 'NOT_FOUND')
    }
    throw error
  }
}

function queryLimit(query: URLSearchParams, fallback = 50) {
  return query.has('limit') ? z.coerce.number().int().min(1).max(100).parse(query.get('limit')) : fallback
}

function operationFilters(query: URLSearchParams) {
  return {
    category: query.get('category') ?? undefined,
    capability: query.get('capability') ?? undefined,
    runtime: z
      .enum(['browser', 'api', 'node', 'database'])
      .optional()
      .parse(query.get('runtime') ?? undefined),
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
      .parse(query.get('inputType') ?? undefined),
    surface: z
      .enum(['human', 'agent'])
      .optional()
      .parse(query.get('surface') ?? undefined),
    deprecated: query.has('deprecated')
      ? z
          .enum(['true', 'false'])
          .transform(value => value === 'true')
          .parse(query.get('deprecated'))
      : undefined,
  }
}

function hasOperationSearchCriteria(
  text: string | undefined,
  filters: ReturnType<typeof operationFilters>,
  parameterNames: readonly string[],
) {
  return Boolean(
    text ||
    parameterNames.length ||
    filters.category ||
    filters.capability ||
    filters.runtime ||
    filters.inputType ||
    filters.surface ||
    filters.deprecated !== undefined,
  )
}

function getOperations(request: Request, operation: string[]) {
  const query = new URL(request.url).searchParams
  const action = operation[1] ?? 'list'
  if (action === 'categories') {
    if (query.get('knownManifestHash') === defaultOperationRegistry.manifestHash)
      return Response.json({ status: 'unchanged', manifestHash: defaultOperationRegistry.manifestHash, categories: [] })
    const counts = new Map<string, number>()
    for (const item of defaultOperationRegistry.list({}, 0, 100).items)
      for (const category of item.categories) counts.set(category, (counts.get(category) ?? 0) + 1)
    return Response.json({
      status: 'current',
      manifestHash: defaultOperationRegistry.manifestHash,
      categories: [...counts]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, operationCount]) => ({ id, operationCount })),
    })
  }
  if (action === 'read')
    return Response.json({
      manifestHash: defaultOperationRegistry.manifestHash,
      operations: readCatalogOperations(operationRefs(query)),
    })

  const filters = operationFilters(query)
  const items = defaultOperationRegistry.list(filters, 0, 100).items
  if (action === 'search') {
    const queryText = query.get('query')?.trim()
    const text = queryText ? z.string().min(1).max(500).parse(queryText).toLowerCase() : undefined
    const requestedParameters = new Set((query.get('parameterNames') ?? '').split(',').filter(Boolean))
    if (!hasOperationSearchCriteria(text, filters, [...requestedParameters]))
      throw new ServiceError('operation_search requires a query or at least one filter.', 'VALIDATION')
    const matches = items
      .map(item => {
        const descriptor = readCatalogOperations([{ id: item.id, version: item.version }])[0]!
        const searchable = `${item.id} ${item.title} ${descriptor.description}`.toLowerCase()
        const matchedParameters = descriptor.inputs.filter(input => requestedParameters.has(input.name)).length
        return { item, descriptor, score: Number(!text || searchable.includes(text)) * 100 + matchedParameters }
      })
      .filter(match => match.score > 0)
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
      .slice(0, queryLimit(query, 25))
      .map(({ item, descriptor }) => ({ ...item, descriptor }))
    return Response.json({
      manifestHash: defaultOperationRegistry.manifestHash,
      query: text ?? null,
      filters,
      page: { limit: queryLimit(query, 25), maxLimit: 100 },
      operations: matches,
    })
  }
  if (action === 'list')
    return Response.json(
      defaultOperationRegistry.list(
        { ...operationFilters(query), idPrefix: query.get('idPrefix') ?? undefined },
        query.has('cursor') ? z.coerce.number().int().nonnegative().parse(query.get('cursor')) : 0,
        queryLimit(query),
        query.get('knownManifestHash') ?? undefined,
      ),
    )
  return unknownOperation()
}

async function getLocatorGraph(request: Request, operation: string[]) {
  if (operation[1] === 'visual') return Response.json(await readLocatorGraphVisualProjection())
  if (operation.length > 1) return unknownOperation()
  const query = new URL(request.url).searchParams
  const target = await resolveTargetProject(z.string().min(1).parse(query.get('target')))
  const qualityPlanId = z.string().min(1).parse(query.get('qualityPlanId'))
  const qualityPlan = await readQualityRequirementGraph({ qualityPlanId })
  assertPlanMatchesTarget(qualityPlan.qualityPlan, target)
  const fromId = query.get('fromId')?.trim()
  if (!fromId) throw new ServiceError('locator_graph_query requires a non-empty fromId.', 'VALIDATION')
  return Response.json(
    await queryLocatorGraph(
      {
        fromId,
        relation: query.get('relation') ?? undefined,
        toType: query.get('toType') ?? undefined,
        cursor: query.get('cursor') ?? undefined,
        limit: z.coerce.number().int().positive().max(100).catch(25).parse(query.get('limit')),
        depth: z.coerce.number().int().positive().max(4).catch(1).parse(query.get('depth')),
      },
      undefined,
      target.id,
    ),
  )
}

async function getTestRunEvidence(request: Request, operation: string[]) {
  const targetFingerprint = request.headers.get('x-appraise-target-project')
  if (!targetFingerprint) throw new ServiceError('Test run not found.', 'NOT_FOUND')
  const target = await resolveTargetProject(targetFingerprint).catch(() => null)
  if (!target) throw new ServiceError('Test run not found.', 'NOT_FOUND')
  const runId = z.string().uuid().parse(operation[1])
  if (operation.length === 2) return Response.json(await readTestRunEvidenceSummary(runId, target.id))
  if (operation[2] === 'diagnose' && operation.length === 3)
    return Response.json(await diagnoseTestRunEvidence(runId, target.id))
  return unknownOperation()
}

async function getQualityOperation(request: Request, operation: string[]) {
  const compatibilityResponse = await getQualityJourneyCompatibilityRoute(operation, new URL(request.url).searchParams)
  if (compatibilityResponse) return compatibilityResponse
  const libraryResponse = await getQualityJourneyLibraryRoute(operation, new URL(request.url).searchParams)
  if (libraryResponse) return libraryResponse
  const triageResponse = await getQualityJourneyTriageRoute(operation, new URL(request.url).searchParams)
  if (triageResponse) return triageResponse
  const discoveryResponse = await getQualityJourneyDiscoveryRoute(operation, new URL(request.url).searchParams)
  if (discoveryResponse) return discoveryResponse
  const scenarioResponse = await getQualityJourneyScenarioRoute(operation, new URL(request.url).searchParams)
  if (scenarioResponse) return scenarioResponse
  const executionResponse = await getQualityJourneyExecutionRoute(operation, new URL(request.url).searchParams)
  if (executionResponse) return executionResponse
  const automationResponse = await getQualityJourneyAutomationRoute(operation, new URL(request.url).searchParams)
  if (automationResponse) return automationResponse
  const analysisResponse = await getQualityJourneyAnalysisRoute(operation, new URL(request.url).searchParams)
  if (analysisResponse) return analysisResponse
  if (operation[1] === 'journeys' && operation.length === 3) {
    const target = await resolveTargetProject(z.string().min(1).parse(new URL(request.url).searchParams.get('target')))
    return Response.json(await getQualityJourney({ journeyId: operation[2]!, targetProjectId: target.id }))
  }
  if (operation[1] === 'journeys' && operation[3] === 'artifacts' && operation.length === 4) {
    const target = await resolveTargetProject(z.string().min(1).parse(new URL(request.url).searchParams.get('target')))
    return Response.json(await listQualityJourneyArtifacts({ journeyId: operation[2]!, targetProjectId: target.id }))
  }
  if (operation[1] === 'journeys' && operation[3] === 'factory-evidence' && operation.length === 4) {
    const target = await resolveTargetProject(z.string().min(1).parse(new URL(request.url).searchParams.get('target')))
    return Response.json(
      await inspectQualityJourneyFactoryEvidence({ journeyId: operation[2]!, targetProjectId: target.id }),
    )
  }
  if (operation[1] === 'methodologies' && operation.length === 2) return Response.json(listQualityMethodologies())
  if (operation[1] === 'methodologies' && operation.length === 5)
    return Response.json(
      readQualityMethodology({ providerId: operation[2], methodologyId: operation[3], version: operation[4] }),
    )
  if (operation[1] === 'plans' && operation[3] === 'locators' && operation.length === 4) {
    const parameters = new URL(request.url).searchParams
    const qualityPlanId = z.string().min(1).parse(operation[2])
    const qualityPlan = await readQualityRequirementGraph({ qualityPlanId })
    const target = await resolveTargetProject(z.string().min(1).parse(parameters.get('target')))
    assertPlanMatchesTarget(qualityPlan.qualityPlan, target)
    return Response.json(
      await searchLocatorGraph(
        {
          qualityPlanId,
          query: z.string().trim().min(1).max(500).parse(parameters.get('query')),
          cursor: z
            .string()
            .regex(/^\d+$/, 'Cursor must be a non-negative integer.')
            .optional()
            .parse(parameters.get('cursor') ?? undefined),
          limit: z.coerce.number().int().positive().max(100).catch(25).parse(parameters.get('limit')),
        },
        undefined,
        target.id,
      ),
    )
  }
  if (operation[1] === 'plans' && operation[3] === 'requirements' && operation.length === 4) {
    const revisionId = new URL(request.url).searchParams.get('revisionId') ?? undefined
    return Response.json(
      await readQualityRequirementGraph({ qualityPlanId: z.string().min(1).parse(operation[2]), revisionId }),
    )
  }
  if (operation[1] === 'plans' && operation[3] === 'requirement-analyses' && operation.length === 5)
    return Response.json(
      await readRequirementAnalysis({ qualityPlanId: operation[2], analysisRevisionId: operation[4] }),
    )
  if (operation[1] === 'plans' && operation[3] === 'validation-designs' && operation.length === 5)
    return Response.json(
      await readValidationDesign({ qualityPlanId: operation[2], validationDesignRevisionId: operation[4] }),
    )
  if (
    operation[1] === 'assessments' &&
    ['readiness', 'diagnose', 'review'].includes(operation[3] ?? '') &&
    operation.length === 4
  )
    return Response.json(await readQualityAssessment(z.string().min(1).parse(operation[2])))
  return unknownOperation()
}

async function getStepDefinitions(request: Request, operation: string[]) {
  const result = await coordinatorStepDefinitionService.read(operation, new URL(request.url).searchParams)
  return Response.json(result.body)
}

async function getDiagnostic(request: Request) {
  const targetProjects = await listTargetProjects()
  const builtInStepDefinitions = await ensureBuiltInStepDefinitionReadiness(prisma)
  const coordinatorContract = {
    version: 'appraise.coordinator-contract/v1',
    hash: `sha256:${createHash('sha256')
      .update(JSON.stringify(coordinatorOperationRegistry.definitions))
      .digest('hex')}`,
  }
  return Response.json({
    ok: true,
    targetProjects,
    checks: [
      { id: 'application', status: 'ok', message: 'AppraiseJS quality coordinator is reachable.' },
      { id: 'authentication', status: 'ok', message: 'Coordinator authentication succeeded.' },
    ],
    builtInStepDefinitions,
    warnings: [],
    recoveryActions: [],
    coordinatorContract,
    links: { application: request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin },
  })
}

async function getEnvironments(request: Request) {
  const target = z.string().min(1).parse(new URL(request.url).searchParams.get('target'))
  const targetProject = await resolveTargetProject(target)
  const environments = await listEnvironments(targetProject.id)
  const knownRegistryHash = new URL(request.url).searchParams.get('knownRegistryHash')
  const registryHash = environmentRegistryHash(environments)
  if (knownRegistryHash === registryHash)
    return Response.json({ targetProjectId: targetProject.id, registryHash, unchanged: true, environments: [] })
  return Response.json({
    targetProjectId: targetProject.id,
    registryHash,
    environments: environments.map(environmentSummary),
  })
}

async function dispatchGet(request: Request, operation: string[]): Promise<Response> {
  if (operation.length === 1 && operation[0] === 'diagnostic') return getDiagnostic(request)
  if (operation.length === 1 && operation[0] === 'target-projects')
    return Response.json({ targetProjects: await listTargetProjects() })
  if (operation[0] === 'operations') return getOperations(request, operation)
  if (operation.length === 1 && operation[0] === 'environments') return getEnvironments(request)
  if (operation[0] === 'locator-graph') return getLocatorGraph(request, operation)
  if (operation[0] === 'step-definitions') return getStepDefinitions(request, operation)
  if (operation[0] === 'test-runs') return getTestRunEvidence(request, operation)
  if (operation[0] === 'quality') return getQualityOperation(request, operation)
  return unknownOperation()
}

async function postTargetProject(body: unknown) {
  const value = z
    .union([
      z
        .object({
          path: z.string().min(1),
          displayName: z.string().min(1).optional(),
          initializeGit: z.boolean().optional(),
        })
        .strict(),
      z.object({ url: z.string().url(), displayName: z.string().min(1).optional() }).strict(),
    ])
    .parse(body)
  const git =
    'path' in value ? await initializeTargetGitRepository(value.path, value.initializeGit ?? false) : undefined
  const targetProject = await registerTargetProject(value)
  const marker =
    targetProject.kind === 'LOCAL_WORKSPACE'
      ? await deriveCoordinatorProjectIdentity(process.cwd()).then(identity =>
          writeTargetProjectMarker(targetProject, identity.projectFingerprint),
        )
      : { status: 'skipped' as const }
  return Response.json(
    {
      targetProject,
      git,
      marker,
    },
    { status: 201 },
  )
}

async function postIndependentTestRun(body: unknown) {
  const common = {
    target: z.string().min(1),
    environmentId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
  }
  const value = z
    .discriminatedUnion('sourceKind', [
      z
        .object({
          ...common,
          sourceKind: z.literal('PUBLISHED_VALIDATION'),
          publicationId: z.string().min(1),
          validationVersionId: z.string().min(1),
          idempotencyKey: z.string().min(1),
        })
        .strict(),
      z
        .object({
          ...common,
          sourceKind: z.literal('AUTHORED_TEST_SNAPSHOT'),
          selections: z
            .array(z.object({ testSuiteId: z.string().min(1), testCaseId: z.string().min(1) }).strict())
            .min(1)
            .max(200),
        })
        .strict(),
    ])
    .parse(body)
  const target = await resolveTargetProject(value.target)
  const service = new RuntimeCapsuleTestRunService()
  if (value.sourceKind === 'AUTHORED_TEST_SNAPSHOT') {
    const prepared = await createIndependentAuthoredCapsuleTestRun({ ...value, targetProjectId: target.id })
    const execution = await service.startIndependentAuthored({ testRunDbId: prepared.id })
    return Response.json({ ...execution, ...prepared }, { status: 201 })
  }
  const prepared = await service.prepareIndependentPublished({
    ...value,
    targetProjectId: target.id,
    preparationKey: value.idempotencyKey,
  })
  const execution = await service.startIndependentPublished({
    ...value,
    targetProjectId: target.id,
    preparationKey: value.idempotencyKey,
    testRunDbId: prepared.id,
  })
  return Response.json({ ...execution, id: prepared.id, runId: prepared.runId }, { status: 201 })
}

function qualityPlanId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

function qualityAssessmentId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

const qualityJourneyWorkLeaseSchema = z.object({
  target: z.string().min(1),
  leaseId: z.string().min(1),
  ownerToken: z.string().min(1),
})

function assertGenericQualityJourneyWorkCompletion(result: unknown) {
  if (typeof result !== 'object' || !result || !('role' in result)) return
  const role = result.role
  if (role === 'SCOUT' || role === 'RESOURCE_EXPLORER')
    throw new ServiceError(
      'Discovery roles must submit through their specialized discovery bundle boundary.',
      'UNAUTHORIZED',
    )
  if (role === 'TEST_SCENARIO_DESIGNER')
    throw new ServiceError(
      'Scenario Designer work must submit through the specialized Scenario Portfolio boundary.',
      'UNAUTHORIZED',
    )
  if (role === 'TRIAGER')
    throw new ServiceError(
      'Triager work must submit through the specialized sealed-evidence report boundary.',
      'UNAUTHORIZED',
    )
}
const qualityJourneyWorkControlSchema = z.object({
  target: z.string().min(1),
  actor: z.enum(['USER', 'COORDINATOR', 'RUNNER']),
  reason: z.string().trim().min(1).max(8_000),
})

function isQualityJourneyWorkOperation(operation: string[], action: string) {
  return operation.length === 6 && operation[1] === 'journeys' && operation[3] === 'work' && operation[5] === action
}

async function postQualityOperation(operation: string[], body: unknown): Promise<Response> {
  const triageResponse = await postQualityJourneyTriageRoute(operation, body)
  if (triageResponse) return triageResponse
  const discoveryResponse = await postQualityJourneyDiscoveryRoute(operation, body)
  if (discoveryResponse) return discoveryResponse
  const scenarioResponse = await postQualityJourneyScenarioRoute(operation, body)
  if (scenarioResponse) return scenarioResponse
  const executionResponse = await postQualityJourneyExecutionRoute(operation, body)
  if (executionResponse) return executionResponse
  const automationResponse = await postQualityJourneyAutomationRoute(operation, body)
  if (automationResponse) return automationResponse
  const analysisResponse = await postQualityJourneyAnalysisRoute(operation, body)
  if (analysisResponse) return analysisResponse
  const key = operation.join('/')
  assertQualityJourneyCutoverRoute(operation)
  if (key === 'quality/journeys') {
    const value = z
      .object({ target: z.string().min(1), idempotencyKey: z.string().min(1), requirement: z.unknown() })
      .parse(body)
    if (!('requirement' in value)) throw new ServiceError('Quality Journey requirement is required.', 'VALIDATION')
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await createQualityJourney({
        targetProjectId: target.id,
        idempotencyKey: value.idempotencyKey,
        requirement: value.requirement,
      }),
      { status: 201 },
    )
  }
  if (key === `quality/journeys/${operation[2]}/resume`) {
    const value = z.object({ target: z.string().min(1) }).parse(body)
    const target = await resolveTargetProject(value.target)
    return Response.json(await resumeQualityJourney({ journeyId: operation[2]!, targetProjectId: target.id }))
  }
  if (key === `quality/journeys/${operation[2]}/commands`) {
    const value = z.object({ target: z.string().min(1), command: z.unknown() }).parse(body)
    const target = await resolveTargetProject(value.target)
    const command = journeyCommandSchema.parse(value.command)
    if (command.journeyId !== operation[2] || command.targetProjectId !== target.id)
      throw new ServiceError('Quality Journey command scope does not match the requested journey.', 'CONFLICT')
    if (isSpecializedAnalysisLifecycleCommand(command.command))
      throw new ServiceError('Phase 3 analysis commands require their dedicated coordinator operation.', 'UNAUTHORIZED')
    if (command.command === 'RETRY_DISCOVERY')
      throw new ServiceError('Phase 4 discovery retries require their dedicated coordinator operation.', 'UNAUTHORIZED')
    if (
      [
        'RETRY_AUTOMATION',
        'START_EXECUTION',
        'PUBLISH_RUN_RESULT',
        'START_REMEDIATION_CYCLE',
        'START_RERUN_CYCLE',
      ].includes(command.command)
    )
      throw new ServiceError(
        'Automation and execution commands require their dedicated coordinator operation.',
        'UNAUTHORIZED',
      )
    if (
      ['START_SCENARIO_DESIGN', 'PUBLISH_SCENARIO_PORTFOLIO', 'DECIDE_SCENARIOS', 'REQUEST_SCENARIO_REVISION'].includes(
        command.command,
      )
    )
      throw new ServiceError('Phase 5 scenario commands require their dedicated coordinator operation.', 'UNAUTHORIZED')
    return Response.json(await submitDurableQualityJourneyCommand(command))
  }
  if (key === `quality/journeys/${operation[2]}/work/claim`) {
    const value = z
      .object({ target: z.string().min(1), role: qualityJourneyRoleSchema, leaseSeconds: z.number().int().optional() })
      .parse(body)
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await claimQualityJourneyWork({ ...value, journeyId: operation[2]!, targetProjectId: target.id }),
    )
  }
  if (isQualityJourneyWorkOperation(operation, 'dispatch')) {
    const value = qualityJourneyWorkLeaseSchema.parse(body)
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await dispatchQualityJourneyWork({
        leaseId: value.leaseId,
        ownerToken: value.ownerToken,
        journeyId: operation[2]!,
        workItemId: operation[4]!,
        targetProjectId: target.id,
      }),
    )
  }
  if (isQualityJourneyWorkOperation(operation, 'cancel')) {
    const value = qualityJourneyWorkControlSchema.parse(body)
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await cancelQualityJourneyWork({
        journeyId: operation[2]!,
        workItemId: operation[4]!,
        targetProjectId: target.id,
        actor: value.actor,
        reason: value.reason,
      }),
    )
  }
  if (isQualityJourneyWorkOperation(operation, 'revoke')) {
    const value = qualityJourneyWorkControlSchema.parse(body)
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await revokeQualityJourneyWorkAuthorization({
        journeyId: operation[2]!,
        workItemId: operation[4]!,
        targetProjectId: target.id,
        actor: value.actor,
        reason: value.reason,
      }),
    )
  }
  if (isQualityJourneyWorkOperation(operation, 'complete')) {
    const value = qualityJourneyWorkLeaseSchema.extend({ result: z.unknown() }).parse(body)
    if (!('result' in value)) throw new ServiceError('Quality Journey worker result is required.', 'VALIDATION')
    assertGenericQualityJourneyWorkCompletion(value.result)
    const target = await resolveTargetProject(value.target)
    return Response.json(
      await completeQualityJourneyWork({
        leaseId: value.leaseId,
        ownerToken: value.ownerToken,
        result: value.result,
        journeyId: operation[2]!,
        workItemId: operation[4]!,
        targetProjectId: target.id,
      }),
    )
  }
  if (key === 'quality/requirements/source') {
    const value = z
      .object({ target: z.string().min(1), source: z.unknown(), idempotencyKey: z.string().min(1) })
      .parse(body)
    if (!('source' in value)) throw new ServiceError('Quality requirement source is required.', 'VALIDATION')
    return Response.json(
      await submitQualityRequirementSource({
        ...value,
        source: value.source as NonNullable<typeof value.source>,
        requireExplicitAnalysis: true,
      }),
      { status: 201 },
    )
  }
  if (key === `quality/plans/${operation[2]}/requirements/analyze`) {
    const value = z.object({ revisionId: z.string().min(1).optional() }).parse(body)
    return Response.json(await readQualityRequirementGraph({ qualityPlanId: qualityPlanId(operation), ...value }))
  }
  if (key === `quality/plans/${operation[2]}/requirements/queries`) {
    const value = z
      .object({
        revisionId: z.string().min(1).optional(),
        answers: z
          .array(
            z.object({
              queryId: z.string().min(1),
              status: z.enum(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION']),
              answer: z.string().optional(),
              rationale: z.string().optional(),
            }),
          )
          .min(1),
        idempotencyKey: z.string().min(1),
      })
      .parse(body)
    return Response.json(await answerQualityRequirementQueries({ qualityPlanId: qualityPlanId(operation), ...value }))
  }
  if (key === `quality/plans/${operation[2]}/requirement-analyses`) {
    const value = z.object({ revisionId: z.string().min(1), proposal: z.unknown() }).parse(body)
    const graph = await readQualityRequirementGraph({
      qualityPlanId: qualityPlanId(operation),
      revisionId: value.revisionId,
    })
    return Response.json(
      await proposeRequirementAnalysis({
        targetProjectId: graph.qualityPlan.targetProjectId,
        qualityPlanRevisionId: value.revisionId,
        proposal: value.proposal,
      }),
      { status: 201 },
    )
  }
  if (key === `quality/plans/${operation[2]}/requirement-analyses/${operation[4]}/decision`) {
    const value = qualityReviewDecisionSchema.parse(body)
    return Response.json(
      await decideRequirementAnalysis({
        analysisRevisionId: z.string().min(1).parse(operation[4]),
        qualityPlanId: qualityPlanId(operation),
        expectedAnalysisHash: value.expectedContentHash,
        ...qualityReviewDecisionInput(value),
      }),
    )
  }
  if (key === `quality/plans/${operation[2]}/validation-designs`) {
    const value = z
      .object({
        revisionId: z.string().min(1),
        requirementAnalysisId: z.string().min(1),
        expectedAnalysisHash: z.string().startsWith('sha256:'),
        expectedObligationSetHash: z.string().startsWith('sha256:'),
        proposal: z.unknown(),
      })
      .parse(body)
    const graph = await readQualityRequirementGraph({
      qualityPlanId: qualityPlanId(operation),
      revisionId: value.revisionId,
    })
    return Response.json(
      await proposeValidationDesign({
        targetProjectId: graph.qualityPlan.targetProjectId,
        qualityPlanRevisionId: value.revisionId,
        requirementAnalysisRevisionId: value.requirementAnalysisId,
        expectedAnalysisHash: value.expectedAnalysisHash,
        expectedObligationSetHash: value.expectedObligationSetHash,
        proposal: value.proposal,
      }),
      { status: 201 },
    )
  }
  if (key === `quality/plans/${operation[2]}/validation-designs/${operation[4]}/decision`) {
    const value = qualityReviewDecisionSchema.parse(body)
    return Response.json(
      await decideValidationDesign({
        validationDesignRevisionId: z.string().min(1).parse(operation[4]),
        qualityPlanId: qualityPlanId(operation),
        expectedDesignHash: value.expectedContentHash,
        ...qualityReviewDecisionInput(value),
      }),
    )
  }
  if (key === 'quality/assessments') {
    const value = z
      .object({
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        subject: z.unknown(),
        baselineAssessmentId: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1),
      })
      .parse(body)
    if (!('subject' in value)) throw new ServiceError('Assessment subject is required.', 'VALIDATION')
    return Response.json(
      await createQualityAssessment({ ...value, subject: value.subject as NonNullable<typeof value.subject> }),
      { status: 201 },
    )
  }
  if (operation[1] === 'assessments' && operation[3] === 'successors' && operation.length === 4) {
    const value = z
      .object({
        subject: z.unknown(),
        disposition: z.object({
          code: z.string().min(1).max(120),
          rationale: z.string().min(1).max(2_000),
          retryReason: z.string().min(1).max(2_000).optional(),
        }),
        idempotencyKey: z.string().min(1),
      })
      .parse(body)
    return Response.json(
      await createQualityAssessmentSuccessor({
        assessmentId: qualityAssessmentId(operation),
        ...value,
        subject: value.subject as NonNullable<typeof value.subject>,
      }),
      { status: 201 },
    )
  }
  if (key === 'quality/assessment-runs') {
    const value = z
      .object({
        assessmentId: z.string().min(1),
        validationVersionIds: z.array(z.string().min(1)).optional(),
        runtime: z
          .object({
            environmentId: z.string().min(1).optional(),
            browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
            cells: z
              .array(
                z
                  .object({
                    validationVersionId: z.string().min(1),
                    resultMatrixCell: z.string().min(1),
                    environmentId: z.string().min(1),
                    browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict()
          .optional(),
        authorizationGrantId: z.string().uuid().optional(),
        executionRequestId: z.string().uuid().optional(),
        expectedRequestHash: z.string().startsWith('sha256:').optional(),
        consentId: z.string().uuid().optional(),
        expectedExecutionManifestHash: z.string().startsWith('sha256:').optional(),
        riskClassification: z.enum(['READ_ONLY', 'REVERSIBLE_WRITE', 'MATERIAL_EFFECT']).optional(),
        materialEffects: z
          .array(
            z.enum([
              'PERMISSION_ESCALATION',
              'ACCOUNT_CREATION',
              'PURCHASE',
              'DESTRUCTIVE_MUTATION',
              'EXTERNAL_MESSAGE',
              'IRREVERSIBLE_SIDE_EFFECT',
              'UNCLASSIFIED_OPERATION',
            ]),
          )
          .optional(),
        idempotencyKey: z.string().min(1),
      })
      .strict()
      .parse(body)
    return Response.json(await runQualityAssessment(value), { status: 202 })
  }
  if (key === 'quality/assessment-execution-authorizations/host') {
    const value = z.object({ assertion: z.string().min(1).max(12_000) }).parse(body)
    return Response.json(await issueHostAssertionGrant(value.assertion), { status: 201 })
  }
  if (key === 'quality/assessment-execution-authorizations/revoke') {
    const value = z.object({ grantId: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(body)
    return Response.json(
      await revokeCredentialExecutionGrant({
        grantId: value.grantId,
        reason: value.reason,
        expectedIssuer: CredentialExecutionAuthorizationIssuer.HOST_ASSERTION,
      }),
    )
  }
  if (key === 'quality/assessment-prepare-runs')
    return Response.json(await prepareQualityAssessmentRun(body), { status: 202 })
  if (key === 'quality/assessment-preflights') return Response.json(await preflightQualityAssessmentRun(body))
  if (key === 'quality/evaluation-subjects/remote-scopes')
    return Response.json(await createRemoteEvaluationScope(body), { status: 201 })
  if (key === 'quality/evaluation-subjects/remote-scope-partitions')
    return Response.json(await createRemoteEvaluationScopePartition(body), { status: 201 })
  if (key === 'quality/evaluation-subjects/remote-scopes/read')
    return Response.json(await readRemoteEvaluationScope(body))
  if (operation[1] === 'assessments' && operation[3] === 'stop' && operation.length === 4) {
    const value = z.object({ reason: z.string().min(1) }).parse(body)
    return Response.json(
      await stopQualityAssessment({
        assessmentId: qualityAssessmentId(operation),
        ...value,
      }),
      { status: 202 },
    )
  }
  if (operation[1] === 'assessments' && operation[3] === 'reconcile' && operation.length === 4) {
    const value = z
      .object({ runIds: z.array(z.string().min(1)).optional(), idempotencyKey: z.string().min(1) })
      .parse(body)
    return Response.json(
      await reconcileQualityAssessment({
        assessmentId: qualityAssessmentId(operation),
        ...value,
      }),
    )
  }
  if (operation[1] === 'assessments' && operation[3] === 'execution-consent' && operation.length === 4) {
    const value = z
      .object({
        consentId: z.string().min(1),
        expectedExecutionManifestHash: z.string().startsWith('sha256:'),
        decision: z.enum(['GRANTED', 'REVOKED']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(body)
    if (value.decision === 'REVOKED')
      return Response.json(
        await revokeExecutionConsent({
          consentId: value.consentId,
          assessmentId: qualityAssessmentId(operation),
          reason: value.rationale,
        }),
      )
    return Response.json(
      await decideExecutionConsent({
        consentId: value.consentId,
        assessmentId: qualityAssessmentId(operation),
        expectedManifestHash: value.expectedExecutionManifestHash,
        grantedBy: value.decidedBy,
        expiresAt: value.expiresAt ? new Date(value.expiresAt) : undefined,
      }),
    )
  }
  if (operation[1] === 'assessments' && operation[3] === 'findings' && operation.length === 4) {
    const value = z
      .object({
        obligationId: z.string().min(1),
        outcome: z.enum(['SATISFIED', 'VIOLATED', 'NOT_EVALUATED']),
        attribution: z.unknown().optional(),
        limitations: z.unknown().optional(),
        evidenceReceiptIds: z.array(z.string().min(1)).min(1),
        expectedEvidenceSetHash: z.string().startsWith('sha256:'),
      })
      .parse(body)
    return Response.json(
      await recordAssessmentFinding({
        assessmentId: qualityAssessmentId(operation),
        qualityObligationRevisionId: value.obligationId,
        evidenceReceiptIds: value.evidenceReceiptIds,
        expectedEvidenceSetHash: value.expectedEvidenceSetHash,
        finding: {
          schemaVersion: '1',
          obligationId: value.obligationId,
          outcome: value.outcome,
          attribution: value.attribution,
        },
        limitations: value.limitations,
      }),
      { status: 201 },
    )
  }
  if (operation[1] === 'assessments' && operation[3] === 'decision' && operation.length === 4) {
    const value = z
      .object({
        expectedEvidenceSetHash: z.string().startsWith('sha256:'),
        decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations', 'needs_revision']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
      })
      .parse(body)
    return Response.json(await decideQualityAssessment({ assessmentId: qualityAssessmentId(operation), ...value }))
  }
  return unknownOperation()
}

async function postEnvironmentEnsure(body: unknown): Promise<Response> {
  const value = z
    .object({
      target: z.string().min(1),
      environmentId: z.string().min(1).optional(),
      allowCreate: z.boolean().optional(),
      proposal: z.unknown().optional(),
    })
    .parse(body)
  const target = await resolveTargetProject(value.target)
  const result = await ensureEnvironment(value, target.id)
  return Response.json({
    targetProjectId: target.id,
    outcome: result.outcome,
    environment: environmentSummary(result.environment),
  })
}

async function postLocatorEnsure(request: Request, body: unknown): Promise<Response> {
  const moduleSpec = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('existing'), id: z.string().min(1) }).strict(),
    z.object({ mode: z.literal('ensure'), name: z.string().trim().min(1).max(200) }).strict(),
  ])
  const value = z
    .object({
      target: z.string().min(1),
      qualityPlanId: z.string().min(1),
      allowCreate: z.boolean().optional(),
      group: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('existing'), id: z.string().min(1) }).strict(),
        z
          .object({
            mode: z.literal('ensure'),
            name: z.string().trim().min(1).max(200),
            route: z.string().trim().startsWith('/').max(2_000),
            module: moduleSpec,
          })
          .strict(),
      ]),
      locator: z
        .object({ name: z.string().trim().min(1).max(200), selector: z.string().trim().min(1).max(10_000) })
        .strict(),
    })
    .strict()
    .parse(body)
  const target = await resolveTargetProject(value.target)
  return Response.json(await ensureTargetLocator(value, target))
}

async function dispatchPost(request: Request, operation: string[], body: unknown): Promise<Response> {
  if (operation.length === 2 && operation[0] === 'diagnostic' && operation[1] === 'preflight')
    return Response.json(await recordAgentPreflightReceipt(body), { status: 201 })
  if (operation.length === 1 && operation[0] === 'target-projects') return postTargetProject(body)
  if (operation.length === 2 && operation[0] === 'environments' && operation[1] === 'ensure')
    return postEnvironmentEnsure(body)
  if (operation.length === 2 && operation[0] === 'locators' && operation[1] === 'ensure')
    return postLocatorEnsure(request, body)
  if (operation.length === 1 && operation[0] === 'test-runs') return postIndependentTestRun(body)
  if (operation[0] === 'quality') return postQualityOperation(operation, body)
  return unknownOperation()
}

export async function GET(request: Request, context: RouteContext) {
  let operation: string[] = []
  try {
    await guardCoordinatorRequest(request)
    operation = (await context.params).operation
    return await dispatchGet(request, operation)
  } catch (error) {
    return responseError(error, coordinatorErrorContext(request, operation))
  }
}

export async function POST(request: Request, context: RouteContext) {
  let operation: string[] = []
  let body: unknown
  try {
    await guardCoordinatorRequest(request)
    operation = (await context.params).operation
    body = await readCoordinatorJson(request)
    return await dispatchPost(request, operation, body)
  } catch (error) {
    return responseError(error, coordinatorErrorContext(request, operation, body))
  }
}
