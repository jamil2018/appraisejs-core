import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import type { ZodError } from 'zod'

import { PLAN_CONTRACT_VERSION, PlanContractError } from '@/lib/plan-contract'
import { CoordinatorPlanCreatePartialError } from '@/services/coordinator/coordinator-plan-service'
import {
  coordinatorErrorEnvelopeSchema,
  type CoordinatorErrorEnvelope,
  type CoordinatorOperationOutcome,
  type CoordinatorRetryStrategy,
  ServiceError,
} from '@/services/shared/errors'
import { CoordinatorProjectMismatchError } from './request-guard'

export type CoordinatorErrorContext = {
  operation: string
  planId?: string
  idempotencyKey?: string
  operationOutcome?: CoordinatorOperationOutcome
}

export type CoordinatorErrorResponse = {
  body: CoordinatorErrorEnvelope
  status: number
}

export class CoordinatorPostCommitSerializationError extends Error {
  constructor(options?: ErrorOptions) {
    super('The coordinator could not serialize the completed operation response.', options)
    this.name = 'CoordinatorPostCommitSerializationError'
  }
}

type ErrorShape = {
  classification: CoordinatorErrorEnvelope['classification']
  message: string
  status: number
  outcome: CoordinatorOperationOutcome
  retry: {
    safe: boolean
    strategy: CoordinatorRetryStrategy
    nextAction?: {
      tool: string
      arguments?: Record<string, unknown>
      reason: string
    }
  }
  details?: CoordinatorErrorEnvelope['details']
}

function canonicalBrowserOrigin(baseUrl: string) {
  const configured = process.env.APPRAISE_BROWSER_ORIGIN?.trim()
  const url = new URL(configured || baseUrl)
  if (!configured && ['127.0.0.1', '::1'].includes(url.hostname)) url.hostname = 'localhost'
  return url.origin
}

export function planLinks(planId: string, baseUrl: string, targetProjectId?: string | null) {
  const project = targetProjectId ? `?project=${encodeURIComponent(targetProjectId)}` : ''
  const route = `/plans/${planId}${project}`
  return {
    appraise: `appraise://plans/${planId}`,
    browser: new URL(route, `${canonicalBrowserOrigin(baseUrl)}/`).href,
    route,
  }
}

export function validationReviewLinks(planId: string, baseUrl: string, targetProjectId?: string | null) {
  const query = new URLSearchParams({ review: 'validation' })
  if (targetProjectId) query.set('project', targetProjectId)
  const route = `/plans/${planId}?${query}`
  return {
    appraise: `appraise://plans/${planId}`,
    browser: new URL(route, `${canonicalBrowserOrigin(baseUrl)}/`).href,
    route,
  }
}

function retry(safe: boolean, strategy: CoordinatorRetryStrategy, reason: string): ErrorShape['retry'] {
  return { safe, strategy, nextAction: { tool: 'coordinator_error_recovery', reason } }
}

// The atomic public contract maps each private failure family at one reviewed boundary.
// fallow-ignore-next-line complexity
function errorShape(error: unknown): ErrorShape {
  if (error instanceof CoordinatorPostCommitSerializationError) {
    return {
      classification: 'appraise_runtime_defect',
      message: 'The coordinator completed the operation but could not serialize its response.',
      status: 500,
      outcome: 'committed',
      retry: retry(
        false,
        'do_not_retry',
        'Read the current state before deciding whether another operation is needed.',
      ),
      details: { consistency: 'committed' },
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return {
      classification: 'state_conflict',
      message: 'A project resource with the same unique identity already exists.',
      status: 409,
      outcome: 'not_committed',
      retry: retry(
        true,
        'read_state_then_retry',
        'Reread the project-scoped resources and submit a compatible change.',
      ),
      details: { constraint: 'unique' },
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return {
      classification: 'infrastructure_failure',
      message: 'The Appraise database schema is behind the application code.',
      status: 503,
      outcome: 'not_started',
      retry: retry(
        true,
        'repair_appraise_then_resume',
        'Run npm run migrate-db from the Appraise project, then retry.',
      ),
      details: { dependency: 'database_schema' },
    }
  }
  if (error instanceof CoordinatorProjectMismatchError) {
    return {
      classification: 'authorization_failure',
      message: 'Coordinator credentials are not valid for this project.',
      status: 403,
      outcome: 'not_started',
      retry: retry(
        false,
        'repair_appraise_then_resume',
        'Reconnect the coordinator to the matching project, then retry.',
      ),
      details: { boundary: 'project_identity' },
    }
  }
  if (error instanceof PlanContractError) {
    return {
      classification: 'appraise_authoring_defect',
      message: 'The authored Appraise artifact does not satisfy the required contract.',
      status: 422,
      outcome: 'not_started',
      retry: retry(false, 'repair_input_then_retry', 'Correct the authored artifact and submit it again.'),
      ...(error.path.length ? { details: { field: error.path.join('.') } } : {}),
    }
  }
  if (error instanceof CoordinatorPlanCreatePartialError) {
    return {
      classification: 'appraise_runtime_defect',
      message: 'The coordinator could not confirm whether the operation completed.',
      status: 500,
      outcome: 'unknown',
      retry: retry(false, 'do_not_retry', 'Read the plan state before deciding whether a new operation is needed.'),
      details: { consistency: 'unknown' },
    }
  }
  if (error instanceof ServiceError) {
    if (error.code === 'NOT_FOUND') {
      return {
        classification: 'resource_missing',
        message: error.message,
        status: error.statusCode,
        outcome: 'not_started',
        retry: retry(false, 'do_not_retry', 'Read the current project state and use an existing resource identifier.'),
      }
    }
    if (error.code === 'UNAUTHORIZED') {
      return {
        classification: 'authorization_failure',
        message: 'Coordinator authorization failed.',
        status: error.statusCode,
        outcome: 'not_started',
        retry: retry(
          false,
          'repair_appraise_then_resume',
          'Reconnect with authorized coordinator credentials, then retry.',
        ),
      }
    }
    if (error.code === 'CONFLICT') {
      return {
        classification: 'state_conflict',
        message: error.message,
        status: error.statusCode,
        outcome: 'not_committed',
        retry: retry(true, 'read_state_then_retry', 'Read the current state and retry with the latest expected value.'),
      }
    }
    if (error.code === 'VALIDATION') {
      return {
        classification: 'request_invalid',
        message: error.message,
        status: error.statusCode,
        outcome: 'not_started',
        retry: retry(
          false,
          'repair_input_then_retry',
          'Correct the request according to the stated requirement, then retry.',
        ),
      }
    }
  }
  return {
    classification: 'appraise_runtime_defect',
    message: 'The coordinator encountered an unexpected internal failure.',
    status: 500,
    outcome: 'unknown',
    retry: retry(false, 'do_not_retry', 'Read the current state and report this error ID to the Appraise operator.'),
  }
}

export function coordinatorError(error: unknown, context: CoordinatorErrorContext): CoordinatorErrorResponse {
  const shape = errorShape(error)
  return {
    status: shape.status,
    body: coordinatorErrorEnvelopeSchema.parse({
      schema: 'appraise.error/v1',
      errorId: randomUUID(),
      occurredAt: new Date().toISOString(),
      classification: shape.classification,
      code: shape.classification,
      message: shape.message,
      httpStatus: shape.status,
      operation: {
        name: context.operation,
        ...(context.planId ? { planId: context.planId } : {}),
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      },
      operationOutcome: context.operationOutcome ?? shape.outcome,
      targetOutcome: 'not_evaluated',
      retry: shape.retry,
      ...(shape.details ? { details: shape.details } : {}),
    }),
  }
}

export function zodCoordinatorError(error: ZodError, context: CoordinatorErrorContext): CoordinatorErrorResponse {
  const issue = error.issues[0]
  const field = issue?.path.join('.')
  return {
    status: 400,
    body: coordinatorErrorEnvelopeSchema.parse({
      schema: 'appraise.error/v1',
      errorId: randomUUID(),
      occurredAt: new Date().toISOString(),
      classification: 'request_invalid',
      code: 'request_invalid',
      message: field ? `Invalid request field: ${field}.` : 'The request is invalid.',
      httpStatus: 400,
      operation: {
        name: context.operation,
        ...(context.planId ? { planId: context.planId } : {}),
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
      retry: retry(false, 'repair_input_then_retry', 'Correct the identified request field, then retry.'),
      ...(field ? { details: { field } } : {}),
    }),
  }
}

export const coordinatorContractVersion = PLAN_CONTRACT_VERSION
