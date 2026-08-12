import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import prisma from '@/config/db-config'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import {
  buildLocatorGraph,
  readLocatorGraphVisualProjection,
  queryLocatorGraph,
} from '@/services/locator-graph/locator-graph-service'
import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import { coordinatorStepDefinitionService } from '@/services/coordinator/coordinator-step-definition-service'
import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  approveQualityValidationDesign,
  compileQualityValidations,
  createQualityAssessment,
  decideQualityAssessment,
  publishQualityValidations,
  proposeQualityValidationDesign,
  readQualityAssessment,
  readQualityRequirementGraph,
  submitQualityRequirementSource,
} from '@/services/coordinator/quality-design-service'
import { prepareQualityAssessmentRun } from '@/services/coordinator/assessment-preparation-service'
import {
  reconcileQualityAssessment,
  runQualityAssessment,
  stopQualityAssessment,
} from '@/services/coordinator/assessment-execution-service'
import { ServiceError } from '@/services/shared/errors'
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
  diagnoseTestRunEvidence,
  preflightStandaloneTargetTestRun,
  readTestRunEvidenceSummary,
} from '@/services/test-run/test-run-service'

export const runtime = 'nodejs'

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

function responseError(error: unknown, context: CoordinatorErrorContext) {
  const serviceError = error instanceof ServiceError ? error : undefined
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
      code: serviceError?.code ?? (error instanceof z.ZodError ? 'VALIDATION' : 'INTERNAL'),
      message,
      httpStatus: status,
      operation: {
        name: context.operation,
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
      retry: { safe: false, strategy: 'do_not_retry' },
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
      operations: defaultOperationRegistry.read(operationRefs(query)),
    })

  const items = defaultOperationRegistry.list(operationFilters(query), 0, 100).items
  if (action === 'search') {
    const text = z.string().trim().min(1).max(500).parse(query.get('query')).toLowerCase()
    const requestedParameters = new Set((query.get('parameterNames') ?? '').split(',').filter(Boolean))
    const matches = items
      .map(item => {
        const descriptor = defaultOperationRegistry.read([{ id: item.id, version: item.version }])[0]!
        const searchable = `${item.id} ${item.title} ${descriptor.description}`.toLowerCase()
        const matchedParameters = descriptor.inputs.filter(input => requestedParameters.has(input.name)).length
        return { item, descriptor, score: Number(searchable.includes(text)) * 100 + matchedParameters }
      })
      .filter(match => match.score > 0)
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
      .slice(0, queryLimit(query, 25))
      .map(({ item, descriptor }) => ({ ...item, descriptor }))
    return Response.json({ manifestHash: defaultOperationRegistry.manifestHash, query: text, operations: matches })
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
  if (operation[1] === 'plans' && operation[3] === 'locators' && operation.length === 4) {
    const qualityPlanId = z.string().min(1).parse(operation[2])
    const qualityPlan = await readQualityRequirementGraph({ qualityPlanId })
    const query = z.string().trim().min(1).max(500).parse(new URL(request.url).searchParams.get('query')).toLowerCase()
    const graph = await buildLocatorGraph(undefined, qualityPlan.qualityPlan.targetProjectId)
    const locators = graph.nodes
      .filter(node => node.type === 'locator' && node.title.toLowerCase().includes(query))
      .slice(0, 25)
    return Response.json({ qualityPlanId, graphHash: graph.contentHash, locators })
  }
  if (operation[1] === 'plans' && operation[3] === 'requirements' && operation.length === 4) {
    const revisionId = new URL(request.url).searchParams.get('revisionId') ?? undefined
    return Response.json(
      await readQualityRequirementGraph({ qualityPlanId: z.string().min(1).parse(operation[2]), revisionId }),
    )
  }
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
    .object({
      path: z.string().min(1),
      displayName: z.string().min(1).optional(),
      initializeGit: z.boolean().optional(),
    })
    .parse(body)
  const [identity, git] = await Promise.all([
    deriveCoordinatorProjectIdentity(process.cwd()),
    initializeTargetGitRepository(value.path, value.initializeGit ?? false),
  ])
  const targetProject = await registerTargetProject({ projectPath: value.path, displayName: value.displayName })
  return Response.json(
    {
      targetProject,
      git,
      marker: await writeTargetProjectMarker(targetProject, identity.projectFingerprint),
    },
    { status: 201 },
  )
}

async function postTestRunPreflight(body: unknown) {
  const value = z
    .object({
      target: z.string().min(1).optional(),
      environmentId: z.string().min(1).optional(),
      featurePaths: z.array(z.string().min(1)).optional(),
      importPaths: z.array(z.string().min(1)).optional(),
      supportPaths: z.array(z.string().min(1)).optional(),
    })
    .parse(body)
  return Response.json(await preflightStandaloneTargetTestRun(value))
}

function qualityPlanId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

function qualityAssessmentId(operation: string[]) {
  return z.string().min(1).parse(operation[2])
}

async function postQualityOperation(operation: string[], body: unknown): Promise<Response> {
  const key = operation.join('/')
  if (key === 'quality/requirements/source') {
    const value = z
      .object({ target: z.string().min(1), source: z.unknown(), idempotencyKey: z.string().min(1) })
      .parse(body)
    if (!('source' in value)) throw new ServiceError('Quality requirement source is required.', 'VALIDATION')
    return Response.json(
      await submitQualityRequirementSource({ ...value, source: value.source as NonNullable<typeof value.source> }),
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
  if (key === `quality/plans/${operation[2]}/requirements/approve`) {
    const value = z
      .object({
        revisionId: z.string().min(1),
        expectedRevisionHash: z.string().startsWith('sha256:'),
        approvedBy: z.string().min(1),
      })
      .parse(body)
    return Response.json(await approveQualityRequirements({ qualityPlanId: qualityPlanId(operation), ...value }))
  }
  if (key === `quality/plans/${operation[2]}/validation-design/proposals`) {
    const value = z
      .object({ revisionId: z.string().min(1), proposal: z.unknown(), idempotencyKey: z.string().min(1) })
      .parse(body)
    if (!('proposal' in value)) throw new ServiceError('Validation design proposal is required.', 'VALIDATION')
    return Response.json(
      await proposeQualityValidationDesign({
        qualityPlanId: qualityPlanId(operation),
        ...value,
        proposal: value.proposal as NonNullable<typeof value.proposal>,
      }),
    )
  }
  if (key === `quality/plans/${operation[2]}/validation-design/approve`) {
    const value = z
      .object({
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        approvedBy: z.string().min(1),
      })
      .parse(body)
    return Response.json(await approveQualityValidationDesign({ qualityPlanId: qualityPlanId(operation), ...value }))
  }
  if (key === `quality/plans/${operation[2]}/validations/compile`) {
    const value = z
      .object({
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        realization: z.unknown(),
      })
      .parse(body)
    if (!('realization' in value)) throw new ServiceError('Validation realization is required.', 'VALIDATION')
    return Response.json(
      await compileQualityValidations({
        qualityPlanId: qualityPlanId(operation),
        ...value,
        realization: value.realization as NonNullable<typeof value.realization>,
      }),
    )
  }
  if (key === `quality/plans/${operation[2]}/validations/publish`) {
    const value = z
      .object({
        revisionId: z.string().min(1),
        validationVersionIds: z.array(z.string().min(1)).min(1),
        expectedCompilationHash: z.string().startsWith('sha256:'),
      })
      .parse(body)
    return Response.json(await publishQualityValidations({ qualityPlanId: qualityPlanId(operation), ...value }))
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
  if (key === 'quality/assessment-runs') {
    const value = z
      .object({
        assessmentId: z.string().min(1).optional(),
        validationVersionIds: z.array(z.string().min(1)).optional(),
        subject: z.unknown().optional(),
        runtime: z.unknown().optional(),
        idempotencyKey: z.string().min(1),
      })
      .parse(body)
    return Response.json(await runQualityAssessment(value as unknown as Parameters<typeof runQualityAssessment>[0]), {
      status: 202,
    })
  }
  if (key === 'quality/assessment-prepare-runs')
    return Response.json(await prepareQualityAssessmentRun(body), { status: 202 })
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
  if (operation[1] === 'assessments' && operation[3] === 'decision' && operation.length === 4) {
    const value = z
      .object({
        expectedEvidenceSetHash: z.string().startsWith('sha256:'),
        decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations']),
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
    projection: result.projection,
    environment: environmentSummary(result.environment),
  })
}

async function dispatchPost(operation: string[], body: unknown): Promise<Response> {
  if (operation.length === 2 && operation[0] === 'diagnostic' && operation[1] === 'preflight')
    return Response.json(await recordAgentPreflightReceipt(body), { status: 201 })
  if (operation.length === 1 && operation[0] === 'target-projects') return postTargetProject(body)
  if (operation.length === 2 && operation[0] === 'environments' && operation[1] === 'ensure')
    return postEnvironmentEnsure(body)
  if (operation.length === 2 && operation[0] === 'test-runs' && operation[1] === 'preflight')
    return postTestRunPreflight(body)
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
    return await dispatchPost(operation, body)
  } catch (error) {
    return responseError(error, coordinatorErrorContext(request, operation, body))
  }
}
