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
