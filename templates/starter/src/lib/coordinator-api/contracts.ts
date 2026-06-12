import type { ZodError } from 'zod'

import { PLAN_CONTRACT_VERSION, PlanContractError } from '@/lib/plan-contract'
import { ServiceError } from '@/services/shared/errors'

export type CoordinatorErrorEnvelope = {
  code: string
  message: string
  path?: string
  recovery?: string
}

export function planLinks(planId: string, baseUrl: string) {
  const route = `/plans/${planId}`
  return {
    appraise: `appraise://plans/${planId}`,
    browser: new URL(route, `${baseUrl.replace(/\/$/, '')}/`).href,
    route,
  }
}

export function coordinatorError(error: unknown): CoordinatorErrorEnvelope | undefined {
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
      ...(error.code === 'CONFLICT' ? { recovery: 'Read the current plan and retry against its latest hash.' } : {}),
    }
  }
}

export function zodCoordinatorError(error: ZodError): CoordinatorErrorEnvelope {
  const issue = error.issues[0]
  return {
    code: 'invalid-request',
    message: issue?.message ?? 'Invalid request.',
    ...(issue?.path.length ? { path: issue.path.join('.') } : {}),
    recovery: 'Correct the identified field and retry.',
  }
}

export const coordinatorContractVersion = PLAN_CONTRACT_VERSION
