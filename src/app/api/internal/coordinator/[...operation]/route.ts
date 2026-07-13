import { z } from 'zod'

import prisma from '@/config/db-config'
import { defaultActionCatalog } from '@/lib/action-catalog'

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
import { enqueueRepositoryExport, runRepositoryExportJob } from '@/services/repository-export/repository-export-service'
import { submitDelegatedValidationAst } from '@/services/coordinator/delegated-validation-ast-service'
import { proposeValidationResources } from '@/services/coordinator/validation-resource-proposal-service'
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

export const runtime = 'nodejs'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const routePlanIdSchema = planIdSchema
const astReviewBindingSchema = z.object({
  operationHash: z.string().startsWith('sha256:').optional(),
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

function responseError(error: unknown): Response {
  const knownResponse = serviceErrorResponse(error) ?? validationErrorResponse(error)
  if (knownResponse) return knownResponse
  console.error('Coordinator API failed', error)
  return Response.json({ error: 'Coordinator API failed.' }, { status: 500 })
}

function withLinks<T extends object>(value: T, planId: string, request: Request) {
  const baseUrl = request.headers.get('x-appraise-base-url') ?? new URL(request.url).origin
  return { ...value, links: planLinks(planId, baseUrl) }
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
  return Response.json(withLinks(plan, plan.planId, request))
}

async function getReview(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
  const review = await readPlanReviewSummary(planId)
  return Response.json(withLinks(review, review.planId, request))
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
    if (repairedEvents.length > 0) return Response.json({ events: repairedEvents })
  }
  return Response.json({ events })
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
  if (operation.length === 2) return Response.json(await readTestRunEvidenceSummary(runId, target.id))
  if (operation[2] === 'diagnose') {
    return Response.json(await diagnoseTestRunEvidence(runId, target.id))
  }
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// fallow-ignore-next-line complexity
async function getValidations(request: Request, operation: string[]) {
  const planId = routePlanIdSchema.parse(operation[1])
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

// Request routing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function dispatchGet(request: Request, operation: string[]) {
  if (operation.length === 1 && operation[0] === 'diagnostic') return getDiagnostic(request)
  if (operation[0] === 'test-runs') return getTestRunEvidence(request, operation)
  if (operation[0] === 'actions') {
    const query = new URL(request.url).searchParams
    if (operation[1] === 'categories') {
      return Response.json(
        defaultActionCatalog.listCategories(
          query.get('parentCategoryId') ?? undefined,
          query.get('knownCatalogHash') ?? undefined,
        ),
      )
    }
    if (operation[1] === 'read') {
      const refs = z
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
      return Response.json({
        catalogHash: defaultActionCatalog.catalogHash,
        actions: defaultActionCatalog.readActions(refs),
      })
    }
    const filter = {
      categoryId: query.get('categoryId') ?? undefined,
      capability: query.get('capability') ?? undefined,
      inputType: query.get('inputType') ?? undefined,
      runtime: z
        .enum(['browser', 'api', 'node', 'database'])
        .optional()
        .parse(query.get('runtime') ?? undefined),
      deprecated: query.has('deprecated')
        ? z
            .enum(['true', 'false'])
            .transform(value => value === 'true')
            .parse(query.get('deprecated'))
        : undefined,
      idPrefix: query.get('idPrefix') ?? undefined,
    }
    return Response.json(
      defaultActionCatalog.listActions(
        filter,
        query.has('cursor') ? z.coerce.number().int().nonnegative().parse(query.get('cursor')) : 0,
        query.has('limit') ? z.coerce.number().int().min(1).max(100).parse(query.get('limit')) : 50,
      ),
    )
  }
  if (operation.length === 1 && operation[0] === 'target-projects')
    return Response.json({ targetProjects: await listTargetProjects() })
  if (operation[0] === 'locator-graph') {
    if (operation[1] === 'visual') return Response.json(await readLocatorGraphVisualProjection())
    const url = new URL(request.url)
    return Response.json(
      await queryLocatorGraph({
        fromId: url.searchParams.get('fromId'),
        relation: url.searchParams.get('relation') ?? undefined,
        toType: url.searchParams.get('toType') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
        limit: z.coerce.number().int().positive().max(100).catch(25).parse(url.searchParams.get('limit')),
        depth: z.coerce.number().int().positive().max(4).catch(1).parse(url.searchParams.get('depth')),
      }),
    )
  }
  if (operation.length === 1 && operation[0] === 'providers') {
    assertProviderNativeRunsEnabled()
    return Response.json({ providers: await listProviderRegistrations() })
  }
  if (operation[0] === 'provider-runs') {
    assertProviderNativeRunsEnabled()
    if (operation.length === 1) return Response.json({ providerRuns: await listProviderWorkflowRuns() })
    return Response.json(await getProviderWorkflowRun(z.string().uuid().parse(operation[1])))
  }
  if (operation[0] !== 'plans') throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  const handlers: Record<string, () => Promise<Response>> = {
    plan: () => getPlan(request, operation),
    events: () => getEvents(request, operation),
    review: () => getReview(request, operation),
    validations: () => getValidations(request, operation),
    completion: async () => Response.json(await reviewImplementationCompletion(routePlanIdSchema.parse(operation[1]))),
  }
  const handler = handlers[operation[2] ?? 'plan']
  if (!handler) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  return handler()
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

async function postCreatePlan(request: Request, body: unknown) {
  const value = parseCreatePlanBody(body)
  const identity = await ensureProjectIdentity()
  const targetProject = value.target ? await resolveTargetProject(value.target) : undefined
  const createdPlan = await createCoordinatorPlan(value.plan, { targetProjectId: targetProject?.id })
  return Response.json(
    {
      ...withLinks(createdPlan, createdPlan.planId, request),
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
    return Response.json(await proposeValidationResources({ planId, proposal: body }, prisma))
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

function assertPlanOperation(operation: string[]): void {
  if (operation[0] !== 'plans') throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// fallow-ignore-next-line complexity
async function dispatchPost(request: Request, operation: string[], body: unknown) {
  if (operation[0] === 'objectives') {
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
  if (operation[0] === 'coordination-slo') {
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
  if (operation[0] === 'repository-exports') {
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
  if (operation[0] === 'delegated' && operation[1] === 'validation-ast-submissions') {
    const value = z.object({ submission: z.unknown(), receipt: z.unknown() }).parse(body)
    return Response.json(
      await submitDelegatedValidationAst({
        submission: value.submission,
        receipt: value.receipt,
        targetFingerprint: request.headers.get('x-appraise-project') ?? '',
      }),
    )
  }
  if (operation[0] === 'provider-runs') {
    assertProviderNativeRunsEnabled()
    return postProviderRun(operation, body)
  }
  if (operation[0] === 'plans' && operation[2] === 'snapshot') {
    const value = z.object({ archiveThroughSequence: z.number().int().nonnegative().optional() }).parse(body)
    return Response.json(
      await createLifecycleSnapshot(routePlanIdSchema.parse(operation[1]), {
        archiveThroughSequence: value.archiveThroughSequence,
      }),
    )
  }
  if (operation[0] === 'plans' && operation[2] === 'continuation-package') {
    const value = z
      .object({
        narrative: z.string(),
        references: z.array(z.string().min(1)).optional(),
        objectiveReference: z.string().min(1).optional(),
      })
      .parse(body)
    return Response.json(await createContinuationPackage({ planId: routePlanIdSchema.parse(operation[1]), ...value }))
  }
  if (operation[0] === 'providers') {
    assertProviderNativeRunsEnabled()
    return postProviderRegistration(operation, body)
  }
  const handlers: Record<string, () => Promise<Response>> = {
    register: () => postRegister(body),
    heartbeat: () => postHeartbeat(body),
    plans: () => postCreatePlan(request, body),
    'target-projects': () => postTargetProject(body),
    'test-runs': () => (operation[1] === 'preflight' ? postTestRunPreflight(body) : postStandaloneTestRun(body)),
    start: () => {
      assertPlanOperation(operation)
      return postStartPlan(operation)
    },
    tasks: () => {
      assertPlanOperation(operation)
      return postTaskUpdate(operation, body)
    },
    events: () => {
      assertPlanOperation(operation)
      return postEventAcknowledgement(operation, body)
    },
    validations: () => {
      assertPlanOperation(operation)
      return postValidationOperation(request, operation, body)
    },
    baseline: () => {
      assertPlanOperation(operation)
      return postBaselineOperation(operation, body)
    },
    implementation: () => {
      assertPlanOperation(operation)
      return postImplementationOperation(operation, body)
    },
  }
  const handler = handlers[operation[2] ?? operation[0]]
  if (!handler) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  return handler()
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await guardCoordinatorRequest(request)
    return await dispatchPost(request, (await context.params).operation, await readCoordinatorJson(request))
  } catch (error) {
    return responseError(error)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await guardCoordinatorRequest(request)
    const operation = (await context.params).operation
    if (operation[0] !== 'plans' || operation.length !== 2) {
      throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
    }
    const body = z
      .object({ plan: planArtifactSchema, expectedHash: z.string().startsWith('sha256:') })
      .parse(await readCoordinatorJson(request))
    const planId = routePlanIdSchema.parse(operation[1])
    const revised = await reviseCoordinatorPlan(planId, body.plan, body.expectedHash)
    return Response.json(withLinks(revised, revised.planId, request))
  } catch (error) {
    return responseError(error)
  }
}
