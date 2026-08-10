import type { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'

const coordinatorErrorClassificationSchema = z.enum([
  'request_invalid',
  'authorization_failure',
  'resource_missing',
  'state_conflict',
  'infrastructure_failure',
  'appraise_authoring_defect',
  'appraise_runtime_defect',
])

const coordinatorOperationOutcomeSchema = z.enum(['not_started', 'not_committed', 'committed', 'unknown'])
export type CoordinatorOperationOutcome = z.infer<typeof coordinatorOperationOutcomeSchema>

const coordinatorRetryStrategySchema = z.enum([
  'repair_input_then_retry',
  'wait_then_retry',
  'read_state_then_retry',
  'repair_appraise_then_resume',
  'do_not_retry',
])
export type CoordinatorRetryStrategy = z.infer<typeof coordinatorRetryStrategySchema>

const boundedTextSchema = z.string().trim().min(1).max(1_000)

export const coordinatorErrorEnvelopeSchema = z
  .object({
    schema: z.literal('appraise.error/v1'),
    errorId: z.string().trim().min(1),
    occurredAt: z.string().datetime(),
    classification: coordinatorErrorClassificationSchema,
    code: z.string().trim().min(1).max(300),
    message: boundedTextSchema,
    httpStatus: z.number(),
    operation: z
      .object({
        name: z.string().trim().min(1).max(300),
        qualityPlanId: z.string().trim().min(1).max(300).optional(),
        idempotencyKey: z.string().trim().min(1).max(1_000).optional(),
      })
      .strict(),
    operationOutcome: coordinatorOperationOutcomeSchema,
    targetOutcome: z.literal('not_evaluated'),
    retry: z
      .object({
        safe: z.boolean(),
        strategy: coordinatorRetryStrategySchema,
        nextAction: z
          .object({
            tool: z.string().trim().min(1).max(300),
            arguments: z.record(z.string(), z.unknown()).optional(),
            reason: boundedTextSchema,
          })
          .strict()
          .optional(),
      })
      .strict(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type CoordinatorErrorEnvelope = z.infer<typeof coordinatorErrorEnvelopeSchema>

export const coordinatorAcknowledgementSchema = z
  .object({
    kind: z.literal('appraise.ack/v1'),
    ok: z.literal(true),
  })
  .strict()

export type CoordinatorAcknowledgement = z.infer<typeof coordinatorAcknowledgementSchema>

export function coordinatorAcknowledgement(): CoordinatorAcknowledgement {
  return coordinatorAcknowledgementSchema.parse({ kind: 'appraise.ack/v1', ok: true })
}

export type ServiceErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'UNAUTHORIZED' | 'CONFLICT' | 'INTERNAL'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: ServiceErrorCode = 'INTERNAL',
    statusCode?: number,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.details = details
    this.statusCode =
      statusCode ??
      (code === 'NOT_FOUND'
        ? 404
        : code === 'VALIDATION'
          ? 400
          : code === 'UNAUTHORIZED'
            ? 401
            : code === 'CONFLICT'
              ? 409
              : 500)
  }
}

/**
 * Maps a thrown ServiceError to the app's ActionResponse shape for Server Actions.
 */
export function serviceErrorToActionResponse(error: ServiceError): ActionResponse {
  return {
    status: error.statusCode,
    success: false,
    error: error.message,
    ...(error.details ? { details: error.details } : {}),
  }
}

/**
 * Maps unknown errors to a 500 ActionResponse.
 */
export function unknownErrorToActionResponse(error: unknown, logPrefix?: string): ActionResponse {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
  if (logPrefix) {
    console.error(`${logPrefix}`, error)
  }
  return {
    status: 500,
    success: false,
    error: `Server error occurred: ${message}`,
  }
}
