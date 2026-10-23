import { randomUUID } from 'node:crypto'

import { z } from 'zod'
import { ServiceError } from '@/services/shared/errors'

type CoordinatorErrorContext = {
  operation: string
  idempotencyKey?: string
  target?: string
  operationId?: string
  effectStarted?: boolean
  externalSubmissionOutcome?: {
    target: string
    journeyId: string
    role: string
    operation: string
    workItemId: string
    attemptId: string
    assignmentId: string
    assignmentGeneration: number
    leaseId: string
    assignmentSecret: string
    idempotencyKey: string
  }
}

export type CoordinatorEffectState = {
  started: boolean
  operationId?: string
}

function bodyRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function optionalContext<K extends keyof Omit<CoordinatorErrorContext, 'operation'>>(
  key: K,
  value: CoordinatorErrorContext[K],
) {
  return value ? { [key]: value } : {}
}

function coordinatorRequestIdempotencyKey(request: Request, source: Record<string, unknown> | undefined) {
  return request.headers.get('idempotency-key') ?? textValue(source?.idempotencyKey)
}

function coordinatorOperationId(source: Record<string, unknown> | undefined, effectState?: CoordinatorEffectState) {
  return effectState?.operationId ?? textValue(source?.operationId)
}

function coordinatorEffectContext(effectState?: CoordinatorEffectState) {
  return effectState?.started ? { effectStarted: true } : {}
}

export const externalSubmissionRecovery = new Map<string, { role: string; operation: string }>([
  ['analysis/external-submissions', { role: 'REQUIREMENT_ANALYZER', operation: 'ANALYSIS_SUBMIT' }],
  ['discovery/external-target-observations', { role: 'SCOUT', operation: 'TARGET_OBSERVATION_SUBMIT' }],
  ['discovery/external-resource-resolutions', { role: 'RESOURCE_EXPLORER', operation: 'RESOURCE_RESOLUTION_SUBMIT' }],
  ['scenarios/external-submissions', { role: 'TEST_SCENARIO_DESIGNER', operation: 'SCENARIO_PORTFOLIO_SUBMIT' }],
  ['automation/external-materializations', { role: 'AUTOMATOR', operation: 'AUTOMATION_MATERIALIZE' }],
  ['triage/external-submit', { role: 'TRIAGER', operation: 'TRIAGE_REPORT_SUBMIT' }],
])

const nonemptyExternalSubmissionText = z.string().min(1)

const externalSubmissionOutcomeFieldsSchema = z.object({
  target: nonemptyExternalSubmissionText,
  workItemId: nonemptyExternalSubmissionText,
  attemptId: nonemptyExternalSubmissionText,
  assignmentId: nonemptyExternalSubmissionText,
  leaseId: nonemptyExternalSubmissionText,
  assignmentSecret: nonemptyExternalSubmissionText,
  idempotencyKey: nonemptyExternalSubmissionText,
  assignmentGeneration: z.number().int().min(1),
})

function externalSubmissionOutcomeContext(operation: string[], source: Record<string, unknown> | undefined) {
  if (operation[0] !== 'quality' || operation[1] !== 'journeys' || !operation[2] || !source) return undefined
  const recovery = externalSubmissionRecovery.get(operation.slice(3).join('/'))
  if (!recovery) return undefined
  const fields = externalSubmissionOutcomeFieldsSchema.safeParse(source)
  if (!fields.success) return undefined
  const {
    target,
    workItemId,
    attemptId,
    assignmentId,
    leaseId,
    assignmentSecret,
    idempotencyKey,
    assignmentGeneration,
  } = fields.data
  return {
    target,
    journeyId: operation[2],
    role: recovery.role,
    operation: recovery.operation,
    workItemId,
    attemptId,
    assignmentId,
    assignmentGeneration,
    leaseId,
    assignmentSecret,
    idempotencyKey,
  }
}

export function coordinatorErrorContext(
  request: Request,
  operation: string[],
  body?: unknown,
  effectState?: CoordinatorEffectState,
): CoordinatorErrorContext {
  const source = bodyRecord(body)
  const externalSubmissionOutcome = externalSubmissionOutcomeContext(operation, source)
  return {
    operation: operation.join('/') || 'unknown',
    ...optionalContext('idempotencyKey', coordinatorRequestIdempotencyKey(request, source)),
    ...optionalContext('target', textValue(source?.target)),
    ...optionalContext('operationId', coordinatorOperationId(source, effectState)),
    ...coordinatorEffectContext(effectState),
    ...(externalSubmissionOutcome ? { externalSubmissionOutcome } : {}),
  }
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

function coordinatorErrorRetry(context: CoordinatorErrorContext) {
  if (context.externalSubmissionOutcome) {
    const { assignmentSecret, ...argumentsWithoutSecret } = context.externalSubmissionOutcome
    void assignmentSecret
    return {
      safe: true,
      strategy: 'read_state_then_retry' as const,
      nextAction: {
        tool: 'quality_journey_external_work_outcome_get_v1',
        arguments: argumentsWithoutSecret,
        reason:
          'Read the durable external submission outcome before deciding whether to retry; provide the same caller-held assignment secret.',
      },
    }
  }
  const readableOperation = context.operation.startsWith('collaboration/') && context.target && context.operationId
  if (!readableOperation) return { safe: false, strategy: 'do_not_retry' as const }
  return {
    safe: true,
    strategy: 'read_state_then_retry' as const,
    nextAction: {
      tool: 'collaboration_get',
      arguments: { target: context.target, operationId: context.operationId },
      reason: 'Read the durable operation before deciding whether any mutation should be retried.',
    },
  }
}

function isPreEffectCoordinatorFailure(error: unknown, effectStarted?: boolean) {
  if (effectStarted) return false
  if (error instanceof z.ZodError) return true
  if (!(error instanceof ServiceError)) return false
  return ['VALIDATION', 'UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'].includes(error.code)
}

function coordinatorOperationOutcome(error: unknown, context: CoordinatorErrorContext) {
  if (isPreEffectCoordinatorFailure(error, context.effectStarted)) return 'not_started'
  if (context.externalSubmissionOutcome) return 'unknown'
  return context.effectStarted ? 'unknown' : 'not_started'
}

function coordinatorErrorDetails(error: unknown, serviceError?: ServiceError) {
  if (error instanceof z.ZodError) {
    return {
      issues: error.issues.map(issue => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    }
  }
  if (serviceError?.details) return serviceError.details
  if (!serviceError) return { cause: error instanceof Error ? error.message : String(error) }
  return undefined
}

function coordinatorErrorCode(error: unknown, serviceError?: ServiceError) {
  if (serviceError) return serviceError.code
  return error instanceof z.ZodError ? 'VALIDATION' : 'INTERNAL'
}

function coordinatorErrorMessage(error: unknown, serviceError?: ServiceError) {
  if (error instanceof z.ZodError) return 'Coordinator request failed validation.'
  return serviceError?.message ?? 'Coordinator API failed.'
}

function coordinatorErrorStatus(error: unknown, serviceError?: ServiceError) {
  if (error instanceof z.ZodError) return 400
  return serviceError?.statusCode ?? 500
}

function coordinatorErrorPayload(error: unknown, context: CoordinatorErrorContext) {
  const serviceError = error instanceof ServiceError ? error : undefined
  const details = coordinatorErrorDetails(error, serviceError)
  const operationOutcome = coordinatorOperationOutcome(error, context)
  return {
    schema: 'appraise.error/v1',
    errorId: randomUUID(),
    occurredAt: new Date().toISOString(),
    classification: errorClassification(error),
    code: coordinatorErrorCode(error, serviceError),
    message: coordinatorErrorMessage(error, serviceError),
    httpStatus: coordinatorErrorStatus(error, serviceError),
    operation: { name: context.operation, ...optionalContext('idempotencyKey', context.idempotencyKey) },
    // An unknown outcome requires an explicit signal that this request crossed
    // a durable or external effect boundary; endpoint names are not evidence.
    operationOutcome,
    targetOutcome: operationOutcome === 'not_started' ? 'not_committed' : 'not_evaluated',
    retry:
      operationOutcome === 'unknown'
        ? coordinatorErrorRetry(context)
        : { safe: false, strategy: 'do_not_retry' as const },
    ...(details ? { details } : {}),
  }
}

/** Shared envelope for coordinator transport failures; exported for contract-level regression coverage. */
export function responseError(error: unknown, context: CoordinatorErrorContext) {
  const payload = coordinatorErrorPayload(error, context)
  return Response.json(payload, { status: payload.httpStatus })
}
