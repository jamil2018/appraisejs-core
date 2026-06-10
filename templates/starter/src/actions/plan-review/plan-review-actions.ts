'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  addPlanRemark,
  approvePlanRevision,
  publishSharedPlanLayout,
  retargetPlanRemark,
  savePersonalPlanLayout,
  transitionPlanRemark,
} from '@/services/plan-review/plan-review-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'
import {
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  startBaselineExecution,
  startImplementation,
} from '@/services/coordinator/coordinator-baseline-service'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan') }),
  z.object({ type: z.literal('task'), taskId: idSchema }),
])
const positionsSchema = z.record(idSchema, z.object({ x: z.number().finite(), y: z.number().finite() }))

async function runAction(planId: string, operation: () => Promise<void>): Promise<ActionResponse> {
  try {
    await operation()
    revalidatePath('/plans')
    revalidatePath(`/plans/${planId}`)
    return { status: 200, success: true }
  } catch (error) {
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    if (error instanceof z.ZodError) return { status: 400, success: false, error: error.issues[0]?.message }
    return unknownErrorToActionResponse(error, 'Plan review action failed')
  }
}

export async function addPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  const value = z
    .object({ planId: idSchema, target: targetSchema, body: z.string().trim().min(1), blocking: z.boolean() })
    .parse(input)
  return runAction(value.planId, () => addPlanRemark(value))
}

export async function transitionPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  const value = z
    .object({
      planId: idSchema,
      threadId: idSchema,
      action: z.enum(['addressed', 'disputed', 'resolved', 'dismissed', 'downgraded']),
      body: z.string().optional(),
    })
    .parse(input)
  return runAction(value.planId, () => transitionPlanRemark(value))
}

export async function retargetPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema, threadId: idSchema, taskId: idSchema }).parse(input)
  return runAction(value.planId, () => retargetPlanRemark(value))
}

export async function approvePlanRevisionAction(input: unknown): Promise<ActionResponse> {
  const value = z
    .object({
      planId: idSchema,
      displayedRevision: z.number().int().positive(),
      resolveThreadId: idSchema.optional(),
      confirmSuspiciousReplacement: z.boolean().optional(),
    })
    .parse(input)
  return runAction(value.planId, () => approvePlanRevision(value))
}

export async function savePersonalPlanLayoutAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema, positions: positionsSchema }).parse(input)
  return runAction(value.planId, () => savePersonalPlanLayout(value))
}

export async function publishSharedPlanLayoutAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema, positions: positionsSchema }).parse(input)
  return runAction(value.planId, () => publishSharedPlanLayout(value))
}

export async function startBaselineExecutionAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema }).parse(input)
  return runAction(value.planId, () => startBaselineExecution(value.planId).then(() => undefined))
}

export async function reconcileBaselineExecutionAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema }).parse(input)
  return runAction(value.planId, () => reconcileBaselineExecution(value.planId).then(() => undefined))
}

export async function cancelBaselineExecutionAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema }).parse(input)
  return runAction(value.planId, () => cancelBaselineExecution(value.planId).then(() => undefined))
}

export async function acknowledgeBaselineFailureAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema, attemptId: idSchema }).parse(input)
  return runAction(value.planId, () =>
    acknowledgeBaselineFailure({ ...value, acknowledgedBy: 'local-user' }).then(() => undefined),
  )
}

export async function justifyBaselineRegressionPassAction(input: unknown): Promise<ActionResponse> {
  const value = z
    .object({ planId: idSchema, attemptId: idSchema, justification: z.string().trim().min(1) })
    .parse(input)
  return runAction(value.planId, () => justifyBaselineRegressionPass(value))
}

export async function acceptBaselineAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema }).parse(input)
  return runAction(value.planId, () => acceptBaseline(value.planId).then(() => undefined))
}

export async function startImplementationAction(input: unknown): Promise<ActionResponse> {
  const value = z.object({ planId: idSchema }).parse(input)
  return runAction(value.planId, () => startImplementation(value.planId).then(() => undefined))
}
