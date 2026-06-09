import { z } from 'zod'

import { guardCoordinatorRequest, readCoordinatorJson } from '@/lib/coordinator-api/request-guard'
import { parseYamlArtifact, planArtifactSchema, validationArtifactSchema } from '@/lib/plan-contract'
import {
  acknowledgePlanEvent,
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
import { ServiceError } from '@/services/shared/errors'

export const runtime = 'nodejs'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
type RouteContext = { params: Promise<{ operation: string[] }> }

function serviceErrorResponse(error: unknown): Response | undefined {
  if (error instanceof ServiceError) return Response.json({ error: error.message }, { status: error.statusCode })
}

function validationErrorResponse(error: unknown): Response | undefined {
  if (error instanceof z.ZodError)
    return Response.json({ error: error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
}

function responseError(error: unknown): Response {
  const knownResponse = serviceErrorResponse(error) ?? validationErrorResponse(error)
  if (knownResponse) return knownResponse
  console.error('Coordinator API failed', error)
  return Response.json({ error: 'Coordinator API failed.' }, { status: 500 })
}

async function getPlan(operation: string[]) {
  return Response.json(await readCoordinatorPlan(idSchema.parse(operation[1])))
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

async function dispatchGet(request: Request, operation: string[]) {
  if (operation[0] !== 'plans') throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  const handlers: Record<string, () => Promise<Response>> = {
    plan: () => getPlan(operation),
    events: () => getEvents(request, operation),
  }
  const handler = handlers[operation[2] ?? 'plan']
  if (!handler) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  return handler()
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

async function postCreatePlan(body: unknown) {
  const value = z.object({ plan: z.union([planArtifactSchema, z.string()]) }).parse(body)
  const plan =
    typeof value.plan === 'string'
      ? (parseYamlArtifact('plan', value.plan) as z.infer<typeof planArtifactSchema>)
      : value.plan
  return Response.json(await createCoordinatorPlan(plan), { status: 201 })
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

async function dispatchPost(operation: string[], body: unknown) {
  const handlers: Record<string, () => Promise<Response>> = {
    register: () => postRegister(body),
    heartbeat: () => postHeartbeat(body),
    plans: () => postCreatePlan(body),
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
  }
  const handler = handlers[operation[2] ?? operation[0]]
  if (!handler) throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
  return handler()
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await guardCoordinatorRequest(request)
    return await dispatchPost((await context.params).operation, await readCoordinatorJson(request))
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
    return Response.json(await reviseCoordinatorPlan(idSchema.parse(operation[1]), body.plan, body.expectedHash))
  } catch (error) {
    return responseError(error)
  }
}
