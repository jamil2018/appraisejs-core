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

export function coordinatorError(error: unknown): CoordinatorErrorEnvelope | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return {
      code: 'database-unique-conflict',
      message: 'A project resource with the same unique identity already exists.',
      recovery: 'Reread the project-scoped resources and reuse the compatible ID or submit a distinct canonical name.',
      details: {
        prismaCode: error.code,
        modelName: error.meta?.modelName,
        fields: error.meta?.target,
      },
    }
  }
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
        planContentHash: error.details.planContentHash,
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
      ? `Fill or correct ${path}, then retry the bounded managed Validation AST check or preview operation.`
      : 'Correct the identified field, then retry validation_ast_check or validation_ast_preview.',
  }
}

export const coordinatorContractVersion = PLAN_CONTRACT_VERSION
