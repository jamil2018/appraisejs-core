import type { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

import { PLAN_CONTRACT_VERSION, PlanContractError } from '@/lib/plan-contract'
import { CoordinatorPlanCreatePartialError } from '@/services/coordinator/coordinator-plan-service'
import { ServiceError } from '@/services/shared/errors'
import { CoordinatorProjectMismatchError } from './request-guard'

export type CoordinatorErrorEnvelope = {
  code: string
  message: string
  path?: string
  recovery?: string
  details?: Record<string, unknown>
}

export function planLinks(planId: string, baseUrl: string) {
  const route = `/plans/${planId}`
  return {
    appraise: `appraise://plans/${planId}`,
    browser: new URL(route, `${baseUrl.replace(/\/$/, '')}/`).href,
    route,
  }
}

export function validationReviewLinks(planId: string, baseUrl: string) {
  const route = `/plans/${planId}?review=validation`
  return {
    appraise: `appraise://plans/${planId}`,
    browser: new URL(route, `${baseUrl.replace(/\/$/, '')}/`).href,
    route,
  }
}

export function coordinatorError(error: unknown): CoordinatorErrorEnvelope | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return {
      code: 'database-schema-drift',
      message: 'The Appraise database schema is behind the application code.',
      recovery: 'Run npm run migrate-db from the Appraise project, then retry the coordinator operation.',
      details: {
        prismaCode: error.code,
        column: error.meta?.column,
        modelName: error.meta?.modelName,
      },
    }
  }
  if (error instanceof CoordinatorProjectMismatchError) {
    return {
      code: 'project-mismatch',
      message: error.message,
      recovery:
        'Point the coordinator at the matching project and restart it, or start the application from the requested project.',
      details: {
        requestedFingerprint: error.requestedFingerprint,
        serverFingerprint: error.serverFingerprint,
        serverProjectPath: error.serverProjectPath,
      },
    }
  }
  if (error instanceof PlanContractError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path.length ? { path: error.path.join('.') } : {}),
      recovery: 'Correct the plan artifact field and retry with the same contract version.',
    }
  }
  if (error instanceof ServiceError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.code === 'CONFLICT' ? { recovery: 'Read the current plan and retry against its latest hash.' } : {}),
    }
  }
  if (error instanceof CoordinatorPlanCreatePartialError) {
    return {
      code: error.code,
      message: error.message,
      recovery: error.details.recovery,
      details: {
        planId: error.details.planId,
        artifactPath: error.details.artifactPath,
        stage: error.details.stage,
        safeToRetry: error.details.safeToRetry,
        contentHash: error.details.contentHash,
      },
    }
  }
}

export function zodCoordinatorError(error: ZodError): CoordinatorErrorEnvelope {
  const issue = error.issues[0]
  const path = issue?.path.join('.')
  return {
    code: 'invalid-request',
    message: path ? `${path}: ${issue?.message ?? 'Invalid request.'}` : (issue?.message ?? 'Invalid request.'),
    ...(path ? { path } : {}),
    recovery: path
      ? `Fill or correct ${path}, then retry the bounded v2 AST check or preview operation.`
      : 'Correct the identified field, then retry validation_ast_check or validation_ast_preview.',
  }
}

export const coordinatorContractVersion = PLAN_CONTRACT_VERSION
