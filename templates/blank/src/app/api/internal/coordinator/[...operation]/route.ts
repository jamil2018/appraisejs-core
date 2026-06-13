import { z } from 'zod'

import {
  coordinatorContractVersion,
  coordinatorError,
  planLinks,
  zodCoordinatorError,
} from '@/lib/coordinator-api/contracts'
import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import { CoordinatorProjectMismatchError } from '@/lib/coordinator-api/request-guard'
import {
  implementationValidationRunSchema,
  parseYamlArtifact,
  planArtifactSchema,
  validationArtifactSchema,
} from '@/lib/plan-contract'
import {
  acknowledgePlanEvent,
  ensureProjectIdentity,
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
  approveValidationFile,
  decideValidationNode,
  publishPreparedValidations,
  submitValidationReview,
} from '@/services/coordinator/coordinator-validation-service'
import {
  applyBlockingFeedback,
  approveImplementationCompletion,
  controlImplementation,
  reachImplementationCheckpoint,
  recordImplementationValidation,
  reviewImplementationCompletion,
  updateImplementationTask,
} from '@/services/coordinator/coordinator-implementation-service'
import { ServiceError } from '@/services/shared/errors'

export const runtime = 'nodejs'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
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

async function getPlan(request: Request, operation: string[]) {
  const planId = idSchema.parse(operation[1])
  return Response.json(withLinks(await readCoordinatorPlan(planId), planId, request))
}

async function getEvents(request: Request, operation: string[]) {
  const url = new URL(request.url)
  const planId = idSchema.parse(operation[1])
  const afterSequence = z.coerce
    .number()
    .int()
    .nonnegative()
    .parse(url.searchParams.get('after') ?? '0')
  const input = { planId, afterSequence }
  const events =
    url.searchParams.get('wait') === 'true'
      ? await waitForPlanEvents({ ...input, signal: request.signal })
      : await readPlanEvents(input)
  return Response.json({ events })
}

async function getDiagnostic(request: Request) {
  const identity = await ensureProjectIdentity()
  return Response.json({
    ok: true,
    project: {
      fingerprint: identity.projectFingerprint,
      canonicalPath: identity.canonicalProjectPath,
    },
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

// Request routing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function dispatchGet(request: Request, operation: string[]) {
  if (operation.length === 1 && operation[0] === 'diagnostic') return getDiagnostic(request)
  if (operation[0] !== 'plans') throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  const handlers: Record<string, () => Promise<Response>> = {
    plan: () => getPlan(request, operation),
    events: () => getEvents(request, operation),
    completion: async () => Response.json(await reviewImplementationCompletion(idSchema.parse(operation[1]))),
  }
  const handler = handlers[operation[2] ?? 'plan']
  if (!handler) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  return handler()
}

// Request parsing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function postImplementationOperation(operation: string[], body: unknown) {
  const planId = idSchema.parse(operation[1])
  const action = operation[3]
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
      planId: idSchema,
      coordinatorId: z.string().min(1),
      reconnectConnectionId: z.string().uuid().optional(),
      takeoverApproved: z.boolean().optional(),
    })
    .parse(body)
  return Response.json(await registerCoordinator(input))
}

async function postHeartbeat(body: unknown) {
  const input = z
    .object({ planId: idSchema, coordinatorId: z.string().min(1), connectionId: z.string().uuid() })
    .parse(body)
  return Response.json(await heartbeatCoordinator(input))
}

async function postCreatePlan(request: Request, body: unknown) {
  const value = z
    .object({
      plan: z.union([planArtifactSchema, z.string()]),
      source: z
        .object({
          path: z.string().min(1),
          external: z.boolean(),
          warning: z.string().optional(),
        })
        .optional(),
    })
    .parse(body)
  const plan =
    typeof value.plan === 'string'
      ? (parseYamlArtifact('plan', value.plan) as z.infer<typeof planArtifactSchema>)
      : value.plan
  const identity = await ensureProjectIdentity()
  return Response.json(
    {
      ...withLinks(await createCoordinatorPlan(plan), plan.planId, request),
      coordinatorProject: {
        fingerprint: identity.projectFingerprint,
        canonicalPath: identity.canonicalProjectPath,
      },
      ...(value.source
        ? {
            source: value.source,
            ...(value.source.external
              ? { warnings: ['Plan source is outside the coordinator project and was explicitly allowed.'] }
              : {}),
          }
        : {}),
    },
    { status: 201 },
  )
}

async function postStartPlan(operation: string[]) {
  return Response.json(await startCoordinatorPlan(idSchema.parse(operation[1])))
}

async function postTaskUpdate(operation: string[], body: unknown) {
  const value = z.object({ status: z.string().min(1), detail: z.string().optional() }).parse(body)
  return Response.json(
    await updateCoordinatorTask({
      planId: idSchema.parse(operation[1]),
      taskId: idSchema.parse(operation[3]),
      ...value,
    }),
  )
}

async function postEventAcknowledgement(operation: string[], body: unknown) {
  const value = z.object({ sequence: z.number().int().positive(), coordinatorId: z.string().min(1) }).parse(body)
  return Response.json(await acknowledgePlanEvent({ planId: idSchema.parse(operation[1]), ...value }))
}

// Request parsing branches stay in this thin HTTP adapter.
// fallow-ignore-next-line complexity
async function postValidationOperation(operation: string[], body: unknown) {
  const planId = idSchema.parse(operation[1])
  if (operation[3] === 'publish') {
    const value = z.object({ validation: validationArtifactSchema }).parse(body)
    return Response.json(await publishPreparedValidations(planId, value.validation))
  }
  if (operation[3] === 'submit') return Response.json(await submitValidationReview(planId))
  if (operation[3] === 'nodes') {
    const value = z
      .object({ decision: z.enum(['approved', 'rejected', 'deferred']), decidedBy: z.string().min(1) })
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

async function dispatchPost(request: Request, operation: string[], body: unknown) {
  const handlers: Record<string, () => Promise<Response>> = {
    register: () => postRegister(body),
    heartbeat: () => postHeartbeat(body),
    plans: () => postCreatePlan(request, body),
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
      return postValidationOperation(operation, body)
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
    const planId = idSchema.parse(operation[1])
    return Response.json(withLinks(await reviseCoordinatorPlan(planId, body.plan, body.expectedHash), planId, request))
  } catch (error) {
    return responseError(error)
  }
}
