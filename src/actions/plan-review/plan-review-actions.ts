'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  addPlanRemark,
  approvePlanRevision,
  publishSharedPlanLayout,
  requestPlanChanges,
  retargetPlanRemark,
  savePersonalPlanLayout,
  transitionPlanRemark,
} from '@/services/plan-review/plan-review-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'
import { planIdSchema } from '@/lib/plan-contract'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { assertPlanBelongsToProject } from '@/services/coordinator/coordinator-plan-service'
import {
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  retryBaselineAfterRepair,
} from '@/services/coordinator/coordinator-baseline-service'
import {
  approveCurrentValidationFile,
  decideValidationNode,
  submitValidationFeedback,
  submitValidationReview,
} from '@/services/coordinator/coordinator-validation-service'
import { approveImplementationCompletion } from '@/services/coordinator/coordinator-implementation-service'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const planTargetSchema = z.object({ type: z.literal('plan') })
const taskTargetSchema = z.object({ type: z.literal('task'), taskId: idSchema })
const validationTargetSchema = z.object({ type: z.literal('validation'), validationId: idSchema })
const fileTargetSchema = z.object({ type: z.literal('file'), path: z.string().min(1) })
const targetSchema = z.discriminatedUnion('type', [planTargetSchema, taskTargetSchema])
const validationFeedbackTargetSchema = z.union([planTargetSchema, validationTargetSchema, fileTargetSchema])
const positionsSchema = z.record(idSchema, z.object({ x: z.number().finite(), y: z.number().finite() }))

async function runAction<T extends { planId: string }>(
  input: unknown,
  schema: z.ZodType<T>,
  operation: (value: T) => Promise<void>,
): Promise<ActionResponse> {
  try {
    const value = schema.parse(input)
    const project = await requireActiveProjectForMutation()
    await assertPlanBelongsToProject(value.planId, project.id)
    await operation(value)
    revalidatePath('/plans')
    revalidatePath(`/plans/${value.planId}`)
    return { status: 200, success: true }
  } catch (error) {
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    if (error instanceof z.ZodError) return { status: 400, success: false, error: error.issues[0]?.message }
    return unknownErrorToActionResponse(error, 'Plan review action failed')
  }
}

export async function addPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({ planId: planIdSchema, target: targetSchema, body: z.string().trim().min(1), blocking: z.boolean() }),
    value => addPlanRemark(value),
  )
}

export async function transitionPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      threadId: idSchema,
      action: z.enum(['addressed', 'disputed', 'resolved', 'dismissed', 'downgraded']),
      body: z.string().optional(),
    }),
    value => transitionPlanRemark(value),
  )
}

export async function retargetPlanRemarkAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema, threadId: idSchema, taskId: idSchema }), value =>
    retargetPlanRemark(value),
  )
}

export async function approvePlanRevisionAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      displayedRevision: z.number().int().positive(),
      expectedPlanHash: z.string().startsWith('sha256:'),
      resolveThreadId: idSchema.optional(),
      confirmSuspiciousReplacement: z.boolean().optional(),
    }),
    value => approvePlanRevision(value),
  )
}

export async function requestPlanChangesAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      displayedRevision: z.number().int().positive(),
      expectedPlanHash: z.string().startsWith('sha256:'),
    }),
    value => requestPlanChanges(value).then(() => undefined),
  )
}

export async function savePersonalPlanLayoutAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema, positions: positionsSchema }), value =>
    savePersonalPlanLayout(value),
  )
}

export async function publishSharedPlanLayoutAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema, positions: positionsSchema }), value =>
    publishSharedPlanLayout(value),
  )
}

export async function cancelBaselineExecutionAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema }), value =>
    cancelBaselineExecution(value.planId).then(() => undefined),
  )
}

export async function retryBaselineAfterRepairAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      reason: z.string().trim().min(1),
      expectedValidationHash: z.string().startsWith('sha256:'),
    }),
    value => retryBaselineAfterRepair(value).then(() => undefined),
  )
}

export async function acknowledgeBaselineFailureAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema, attemptId: idSchema }), value =>
    acknowledgeBaselineFailure({ ...value, acknowledgedBy: 'local-user' }).then(() => undefined),
  )
}

export async function justifyBaselineRegressionPassAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({ planId: planIdSchema, attemptId: idSchema, justification: z.string().trim().min(1) }),
    value => justifyBaselineRegressionPass(value),
  )
}

export async function acceptBaselineAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema }), value =>
    acceptBaseline(value.planId).then(() => undefined),
  )
}

export async function completeImplementationAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      evidenceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      confirmCompletion: z.literal(true),
    }),
    value =>
      approveImplementationCompletion({
        planId: value.planId,
        contentHash: value.evidenceHash,
        approvedBy: 'local-user',
      }).then(() => undefined),
  )
}

export async function decideValidationNodeAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      validationId: idSchema,
      decision: z.enum(['approved', 'rejected', 'deferred']),
      operationHash: z.string().startsWith('sha256:'),
      extensionArtifactHashes: z.array(z.string().startsWith('sha256:')),
    }),
    value => decideValidationNode({ ...value, decidedBy: 'local-user' }).then(() => undefined),
  )
}

export async function approveValidationFileAction(input: unknown): Promise<ActionResponse> {
  return runAction(input, z.object({ planId: planIdSchema, path: z.string().min(1) }), value =>
    approveCurrentValidationFile({ ...value, approvedBy: 'local-user' }).then(() => undefined),
  )
}

export async function submitValidationReviewAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      operationHash: z.string().startsWith('sha256:'),
      extensionArtifactHashes: z.array(z.string().startsWith('sha256:')),
    }),
    value =>
      submitValidationReview(value.planId, {
        operationHash: value.operationHash,
        extensionArtifactHashes: value.extensionArtifactHashes,
      }).then(() => undefined),
  )
}

export async function submitValidationFeedbackAction(input: unknown): Promise<ActionResponse> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      scope: z.enum(['test_artifact', 'product_scope']),
      target: validationFeedbackTargetSchema,
      body: z.string().trim().min(1),
      affectedValidationIds: z.array(idSchema).optional(),
      affectedFilePaths: z.array(z.string().min(1)).optional(),
    }),
    value => submitValidationFeedback({ ...value, actor: 'local-user' }).then(() => undefined),
  )
}
