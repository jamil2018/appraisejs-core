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
import {
  coordinatorAcknowledgement,
  coordinatorErrorEnvelopeSchema,
  type CoordinatorAcknowledgement,
  type CoordinatorErrorEnvelope,
  ServiceError,
} from '@/services/shared/errors'
import { planIdSchema } from '@/lib/plan-contract'
import { requireActiveProjectForPlanMutation } from '@/lib/active-project'
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
import { coordinatorError, zodCoordinatorError } from '@/lib/coordinator-api/contracts'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const planTargetSchema = z.object({ type: z.literal('plan') })
const taskTargetSchema = z.object({ type: z.literal('task'), taskId: idSchema })
const validationTargetSchema = z.object({ type: z.literal('validation'), validationId: idSchema })
const fileTargetSchema = z.object({ type: z.literal('file'), path: z.string().min(1) })
const targetSchema = z.discriminatedUnion('type', [planTargetSchema, taskTargetSchema])
const validationFeedbackTargetSchema = z.union([planTargetSchema, validationTargetSchema, fileTargetSchema])
const positionsSchema = z.record(idSchema, z.object({ x: z.number().finite(), y: z.number().finite() }))

export type PlanReviewActionResult = CoordinatorAcknowledgement | CoordinatorErrorEnvelope

function inputPlanId(input: unknown) {
  return typeof input === 'object' && input && 'planId' in input && typeof input.planId === 'string'
    ? input.planId
    : undefined
}

function hasChangedValidationFiles(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'changedFiles' in error.details &&
    Array.isArray(error.details.changedFiles)
  )
}

function planReviewError(error: unknown, operation: string, planId?: string): CoordinatorErrorEnvelope {
  const response =
    error instanceof z.ZodError
      ? zodCoordinatorError(error, { operation, planId })
      : coordinatorError(error, { operation, planId })
  const envelope =
    error instanceof ServiceError && error.details ? { ...response.body, details: error.details } : response.body
  if (hasChangedValidationFiles(error)) {
    return coordinatorErrorEnvelopeSchema.parse({ ...envelope, code: 'validation_artifact_changed' })
  }
  return coordinatorErrorEnvelopeSchema.parse(envelope)
}

async function runAction<T extends { planId: string }>(
  input: unknown,
  schema: z.ZodType<T>,
  operation: (value: T) => Promise<void>,
): Promise<PlanReviewActionResult> {
  try {
    const value = schema.parse(input)
    const project = await requireActiveProjectForPlanMutation(value.planId)
    await assertPlanBelongsToProject(value.planId, project.id)
    await operation(value)
    revalidatePath('/plans')
    revalidatePath(`/plans/${value.planId}`)
    return coordinatorAcknowledgement()
  } catch (error) {
    return planReviewError(error, 'plan_review_action', inputPlanId(input))
  }
}

export async function addPlanRemarkAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(
    input,
    z.object({ planId: planIdSchema, target: targetSchema, body: z.string().trim().min(1), blocking: z.boolean() }),
    value => addPlanRemark(value),
  )
}

export async function transitionPlanRemarkAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function retargetPlanRemarkAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema, threadId: idSchema, taskId: idSchema }), value =>
    retargetPlanRemark(value),
  )
}

export async function approvePlanRevisionAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function requestPlanChangesAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function savePersonalPlanLayoutAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema, positions: positionsSchema }), value =>
    savePersonalPlanLayout(value),
  )
}

export async function publishSharedPlanLayoutAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema, positions: positionsSchema }), value =>
    publishSharedPlanLayout(value),
  )
}

export async function cancelBaselineExecutionAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema }), value =>
    cancelBaselineExecution(value.planId).then(() => undefined),
  )
}

export async function retryBaselineAfterRepairAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function acknowledgeBaselineFailureAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema, attemptId: idSchema }), value =>
    acknowledgeBaselineFailure({ ...value, acknowledgedBy: 'local-user' }).then(() => undefined),
  )
}

export async function justifyBaselineRegressionPassAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(
    input,
    z.object({ planId: planIdSchema, attemptId: idSchema, justification: z.string().trim().min(1) }),
    value => justifyBaselineRegressionPass(value),
  )
}

export async function acceptBaselineAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema }), value =>
    acceptBaseline(value.planId).then(() => undefined),
  )
}

export async function completeImplementationAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function decideValidationNodeAction(input: unknown): Promise<PlanReviewActionResult> {
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

export async function approveValidationFileAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(input, z.object({ planId: planIdSchema, path: z.string().min(1) }), value =>
    approveCurrentValidationFile({ ...value, approvedBy: 'local-user' }).then(() => undefined),
  )
}

export async function submitValidationReviewAction(input: unknown): Promise<PlanReviewActionResult> {
  return runAction(
    input,
    z.object({
      planId: planIdSchema,
      operationHash: z.string().startsWith('sha256:'),
      reviewStateHash: z.string().startsWith('sha256:'),
      extensionArtifactHashes: z.array(z.string().startsWith('sha256:')),
    }),
    value =>
      submitValidationReview(value.planId, {
        operationHash: value.operationHash,
        reviewStateHash: value.reviewStateHash,
        extensionArtifactHashes: value.extensionArtifactHashes,
      }).then(() => undefined),
  )
}

export async function submitValidationFeedbackAction(input: unknown): Promise<PlanReviewActionResult> {
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
