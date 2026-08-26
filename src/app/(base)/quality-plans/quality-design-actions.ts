'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  answerQualityRequirementQueries,
  approveQualityRequirements,
  approveQualityValidationDesign,
  createQualityAssessment,
  decideQualityAssessment,
  proposeQualityValidationDesign,
  readQualityAssessment,
  readQualityRequirementGraph,
} from '@/services/coordinator/quality-design-service'
import { createRemoteEvaluationScope } from '@/services/coordinator/remote-evaluation-scope-service'
import {
  preflightQualityAssessmentRun,
  prepareQualityAssessmentRun,
} from '@/services/coordinator/assessment-preparation-service'
import {
  decideRequirementAnalysis,
  decideValidationDesign,
  readRequirementAnalysis,
  readValidationDesign,
} from '@/services/coordinator/quality-operating-system-service'
import {
  reconcileQualityAssessment,
  runQualityAssessment,
  stopQualityAssessment,
} from '@/services/coordinator/assessment-execution-service'
import { serviceErrorToActionResponse, unknownErrorToActionResponse, ServiceError } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const qualityPlanApprovalSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  expectedRevisionHash: z.string().startsWith('sha256:'),
  approvedBy: z.string().trim().min(1).max(200),
})

const qualityOsDecisionSchema = z.object({
  qualityPlanId: z.string().min(1),
  artifactId: z.string().min(1),
  expectedContentHash: z.string().startsWith('sha256:'),
  decision: z.enum(['APPROVED', 'NEEDS_REVISION', 'REJECTED']),
  decidedBy: z.string().trim().min(1).max(200),
  rationale: z.string().trim().min(1).max(2_000),
})

const qualityAssessmentDecisionSchema = z.object({
  assessmentId: z.string().min(1),
  expectedEvidenceSetHash: z.string().startsWith('sha256:'),
  decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations']),
  decidedBy: z.string().trim().min(1).max(200),
  rationale: z.string().trim().min(1).max(2_000),
})

const requirementQueryAnswersSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  answers: z
    .array(
      z.object({
        queryId: z.string().min(1),
        status: z.enum(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION']),
        answer: z.string().trim().max(4_000).optional(),
        rationale: z.string().trim().max(4_000).optional(),
      }),
    )
    .min(1),
})

const validationProposalSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  proposal: z.unknown(),
  idempotencyKey: z.string().trim().min(1).max(200),
})

const validationDesignApprovalSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  expectedDesignHash: z.string().startsWith('sha256:'),
  approvedBy: z.string().trim().min(1).max(200),
})

const qualityPlanRevisionSchema = {
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
}
const designHashSchema = z.string().startsWith('sha256:')
const idempotencyKeySchema = z.string().trim().min(1).max(200)
const remoteScopeIdempotencyKeySchema = z.string().min(1)
const remoteScopeSubjectSchema = z
  .object({
    subjectRevisionId: z.string().min(1),
    expectedSubjectDigest: designHashSchema.optional(),
  })
  .strict()
const artifactSubjectSchema = z
  .object({
    subjectDigest: designHashSchema,
    subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
    authority: z.string().trim().min(1).max(1_000),
    metadata: z.unknown().optional(),
  })
  .strict()
const assessmentSubjectSchema = z.union([artifactSubjectSchema, remoteScopeSubjectSchema])
const approvedBindingsSchema = z.object({
  expectedDesignHash: designHashSchema,
  validationBindings: z.unknown(),
  environmentId: z.string().min(1),
})

const assessmentCreateSchema = z
  .object({
    ...qualityPlanRevisionSchema,
    idempotencyKey: idempotencyKeySchema,
    baselineAssessmentId: z.string().min(1).optional(),
    subject: assessmentSubjectSchema,
  })
  .strict()

const assessmentRunSchema = z.object({
  assessmentId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  runtime: z.object({
    cells: z
      .array(
        z.object({
          validationVersionId: z.string().min(1),
          resultMatrixCell: z.string().min(1),
          environmentId: z.string().min(1),
          browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']),
        }),
      )
      .min(1),
  }),
})
const remoteScopeCreateSchema = z
  .object({
    ...qualityPlanRevisionSchema,
    ...approvedBindingsSchema.shape,
    idempotencyKey: remoteScopeIdempotencyKeySchema,
  })
  .strict()
const assessmentPreparationSchema = z
  .object({
    ...qualityPlanRevisionSchema,
    ...approvedBindingsSchema.shape,
    subject: assessmentSubjectSchema,
    runtime: z.object({ browserEngine: z.literal('CHROMIUM').optional() }).default({}),
    expectedPreflight: z
      .object({
        algorithmVersion: z.literal('appraise.quality-assessment-preflight/v2'),
        preflightHash: designHashSchema,
      })
      .strict()
      .optional(),
    idempotencyKey: idempotencyKeySchema.optional(),
  })
  .strict()

const assessmentStopSchema = z.object({ assessmentId: z.string().min(1), reason: z.string().trim().min(1).max(2_000) })
const assessmentReconcileSchema = z.object({
  assessmentId: z.string().min(1),
  runIds: z.array(z.string().min(1)).optional(),
})

function actionError(error: unknown, context: string): ActionResponse {
  if (error instanceof z.ZodError) return { status: 400, success: false, error: error.issues[0]?.message }
  if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
  return unknownErrorToActionResponse(error, context)
}

function revalidateQualityPaths(qualityPlanId: string, assessmentId?: string) {
  revalidatePath('/quality-plans')
  revalidatePath(`/quality-plans/${qualityPlanId}`)
  revalidatePath('/assessments')
  if (assessmentId) revalidatePath(`/assessments/${assessmentId}`)
}

async function assertQualityPlanScope(qualityPlanId: string, revisionId?: string) {
  const [project, packet] = await Promise.all([
    requireActiveProjectForMutation(),
    readQualityRequirementGraph({ qualityPlanId, revisionId }),
  ])
  if (packet.qualityPlan.targetProjectId !== project.id) {
    throw new ServiceError('Quality Plan is outside the active project scope.', 'CONFLICT', 409)
  }
  return packet
}

async function assertAssessmentScope(assessmentId: string) {
  const [project, packet] = await Promise.all([requireActiveProjectForMutation(), readQualityAssessment(assessmentId)])
  if (packet.qualityPlan.targetProjectId !== project.id) {
    throw new ServiceError('Assessment is outside the active project scope.', 'CONFLICT', 409)
  }
  return packet
}

export async function approveQualityRequirementsAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = qualityPlanApprovalSchema.parse(input)
    await assertQualityPlanScope(value.qualityPlanId, value.revisionId)
    await approveQualityRequirements(value)
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Quality Plan requirement approval failed')
  }
}

export async function decideRequirementAnalysisAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = qualityOsDecisionSchema.parse(input)
    const analysis = await readRequirementAnalysis({
      qualityPlanId: value.qualityPlanId,
      analysisRevisionId: value.artifactId,
    })
    await assertQualityPlanScope(value.qualityPlanId, analysis.qualityPlanRevisionId)
    await decideRequirementAnalysis({
      analysisRevisionId: value.artifactId,
      qualityPlanId: value.qualityPlanId,
      expectedAnalysisHash: value.expectedContentHash,
      decision: value.decision,
      decidedBy: value.decidedBy,
      rationale: value.rationale,
    })
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Requirement analysis decision failed')
  }
}

export async function decideValidationDesignAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = qualityOsDecisionSchema.parse(input)
    const design = await readValidationDesign({
      qualityPlanId: value.qualityPlanId,
      validationDesignRevisionId: value.artifactId,
    })
    await assertQualityPlanScope(value.qualityPlanId, design.qualityPlanRevisionId)
    await decideValidationDesign({
      validationDesignRevisionId: value.artifactId,
      qualityPlanId: value.qualityPlanId,
      expectedDesignHash: value.expectedContentHash,
      decision: value.decision,
      decidedBy: value.decidedBy,
      rationale: value.rationale,
    })
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Validation design decision failed')
  }
}

export async function decideQualityAssessmentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = qualityAssessmentDecisionSchema.parse(input)
    const packet = await assertAssessmentScope(value.assessmentId)
    await decideQualityAssessment(value)
    revalidateQualityPaths(packet.qualityPlan.id, value.assessmentId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Assessment decision failed')
  }
}

export async function answerQualityRequirementQueriesAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = requirementQueryAnswersSchema.parse(input)
    await assertQualityPlanScope(value.qualityPlanId, value.revisionId)
    await answerQualityRequirementQueries(value)
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Requirement query answer failed')
  }
}

export async function proposeQualityValidationDesignAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = validationProposalSchema.parse(input)
    await assertQualityPlanScope(value.qualityPlanId, value.revisionId)
    await proposeQualityValidationDesign({ ...value, proposal: value.proposal })
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Validation scenario proposal failed')
  }
}

export async function approveQualityValidationDesignAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = validationDesignApprovalSchema.parse(input)
    await assertQualityPlanScope(value.qualityPlanId, value.revisionId)
    await approveQualityValidationDesign(value)
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Validation scenario approval failed')
  }
}

export async function createQualityAssessmentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentCreateSchema.parse(input)
    await assertQualityPlanScope(value.qualityPlanId, value.revisionId)
    const packet = await createQualityAssessment(value)
    revalidateQualityPaths(value.qualityPlanId, packet.assessment.id)
    return { status: 200, success: true, data: { assessmentId: packet.assessment.id } }
  } catch (error) {
    return actionError(error, 'Assessment creation failed')
  }
}

export async function createRemoteEvaluationScopeAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = remoteScopeCreateSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await createRemoteEvaluationScope({
      target: project.id,
      qualityPlanId: value.qualityPlanId,
      revisionId: value.revisionId,
      expectedDesignHash: value.expectedDesignHash,
      validationBindings: value.validationBindings,
      environment: { environmentId: value.environmentId },
      idempotencyKey: value.idempotencyKey,
    })
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 201, success: true, data: { subjectRevisionId: result.subject.id } }
  } catch (error) {
    return actionError(error, 'Remote evaluation scope creation failed')
  }
}

export async function assessmentPreflightAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentPreparationSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const preflight = await preflightQualityAssessmentRun({
      target: project.id,
      qualityPlanId: value.qualityPlanId,
      revisionId: value.revisionId,
      expectedDesignHash: value.expectedDesignHash,
      validationBindings: value.validationBindings,
      environment: { environmentId: value.environmentId },
      subject: value.subject,
      runtime: value.runtime,
    })
    return { status: 200, success: true, data: preflight }
  } catch (error) {
    return actionError(error, 'Assessment preflight failed')
  }
}

export async function assessmentPrepareAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentPreparationSchema.extend({ idempotencyKey: idempotencyKeySchema }).parse(input)
    const project = await requireActiveProjectForMutation()
    const prepared = await prepareQualityAssessmentRun({
      target: project.id,
      qualityPlanId: value.qualityPlanId,
      revisionId: value.revisionId,
      expectedDesignHash: value.expectedDesignHash,
      validationBindings: value.validationBindings,
      environment: { environmentId: value.environmentId },
      subject: value.subject,
      runtime: value.runtime,
      expectedPreflight: value.expectedPreflight,
      idempotencyKey: value.idempotencyKey,
    })
    revalidateQualityPaths(value.qualityPlanId)
    return { status: 200, success: true, data: prepared }
  } catch (error) {
    return actionError(error, 'Assessment preparation failed')
  }
}

export async function runQualityAssessmentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentRunSchema.parse(input)
    const packet = await assertAssessmentScope(value.assessmentId)
    await runQualityAssessment(value)
    revalidateQualityPaths(packet.qualityPlan.id, value.assessmentId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Assessment execution failed')
  }
}

export async function stopQualityAssessmentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentStopSchema.parse(input)
    const packet = await assertAssessmentScope(value.assessmentId)
    await stopQualityAssessment(value)
    revalidateQualityPaths(packet.qualityPlan.id, value.assessmentId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Assessment stop failed')
  }
}

export async function reconcileQualityAssessmentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = assessmentReconcileSchema.parse(input)
    const packet = await assertAssessmentScope(value.assessmentId)
    await reconcileQualityAssessment(value)
    revalidateQualityPaths(packet.qualityPlan.id, value.assessmentId)
    return { status: 200, success: true }
  } catch (error) {
    return actionError(error, 'Assessment reconciliation failed')
  }
}
