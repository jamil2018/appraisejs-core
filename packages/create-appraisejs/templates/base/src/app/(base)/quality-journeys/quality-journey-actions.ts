'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
} from '@/services/coordinator/quality-journey-analysis-service'
import {
  commentQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
  disposeQualityJourneyScenarioComment,
  requestQualityJourneyScenarioRevision,
} from '@/services/coordinator/quality-journey-scenario-service'
import {
  createQualityJourney,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from '@/services/coordinator/quality-journey-service'
import { ServiceError, serviceErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)

const createJourneySchema = z
  .object({
    objective: z.string().trim().min(1).max(8_000),
    context: z.string().trim().max(8_000).optional(),
    idempotencyKey: id,
  })
  .strict()

const answerQuestionSchema = z
  .object({
    journeyId: id,
    analysisRevisionId: id,
    questionId: id,
    answerId: id,
    idempotencyKey: id,
    answer: z.string().trim().min(1).max(8_000),
    correctionOfAnswerId: id.optional(),
  })
  .strict()

const reviewCommandSchema = z
  .object({
    journeyId: id,
    analysisRevisionId: id,
    artifactId: id,
    contentHash: hash,
    expectedStateHash: hash,
    commandId: id,
    idempotencyKey: id,
  })
  .strict()

const requestRevisionSchema = reviewCommandSchema
  .extend({ feedback: z.string().trim().min(1).max(8_000), expectedReviewHash: hash })
  .strict()

const scenarioReviewSchema = z
  .object({
    journeyId: id,
    portfolioId: id,
    portfolioRevisionId: id,
    portfolioHash: hash,
    expectedStateHash: hash,
    expectedReviewHash: hash,
    commandId: id,
    idempotencyKey: id,
  })
  .strict()
const scenarioDecisionSchema = scenarioReviewSchema
  .extend({
    approvedScenarioRevisionIds: z.array(id).max(512),
    rejectedScenarioRevisionIds: z.array(id).max(512),
    feedback: z.string().trim().min(1).max(8_000).optional(),
  })
  .strict()
const scenarioCommentSchema = scenarioReviewSchema
  .pick({ journeyId: true, portfolioRevisionId: true, expectedReviewHash: true })
  .extend({
    scenarioRevisionId: id.optional(),
    comment: z.string().trim().min(1).max(8_000),
    blocking: z.boolean().default(false),
    idempotencyKey: id,
  })
  .strict()
const scenarioCommentDispositionSchema = scenarioReviewSchema
  .pick({ journeyId: true, portfolioRevisionId: true, expectedReviewHash: true })
  .extend({ commentId: id, idempotencyKey: id })
  .strict()
const scenarioRevisionRequestSchema = scenarioReviewSchema
  .extend({ feedback: z.string().trim().min(1).max(8_000) })
  .strict()

function qualityJourneyActionError(error: unknown): ActionResponse {
  if (error instanceof z.ZodError) return { status: 400, success: false, error: error.issues[0]?.message }
  if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
  return {
    status: 500,
    success: false,
    error: error instanceof Error ? error.message : 'The Quality Journey request could not be completed.',
  }
}

function requirementHash(requirement: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(requirement)).digest('hex')}`
}

export async function createQualityJourneyAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = createJourneySchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const requirement = { objective: value.objective, context: value.context || undefined }
    const created = await createQualityJourney({
      targetProjectId: project.id,
      idempotencyKey: value.idempotencyKey,
      requirement,
    })
    const journey = created.journey

    if (journey.stage === 'INTAKE') {
      const result = await submitDurableQualityJourneyCommand({
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: `submit-requirement:${value.idempotencyKey}`,
        journeyId: journey.journeyId,
        targetProjectId: project.id,
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        expectedStateHash: journey.stateHash,
        idempotencyKey: `submit-requirement:${value.idempotencyKey}`,
        inputArtifactRefs: [],
        payload: {
          journeyRevisionId: journey.activeRevisionIds.journey,
          requirementHash: requirementHash(requirement),
        },
      })
      if (result.outcome !== 'COMMITTED')
        throw new ServiceError(
          'Requirement submission did not commit. Refresh the journey and retry safely.',
          'CONFLICT',
        )
    }

    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${journey.journeyId}`)
    return { status: 201, success: true, data: { journeyId: journey.journeyId } }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function answerQualityJourneyAnalysisQuestionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = answerQuestionSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    await getQualityJourney({ journeyId: value.journeyId, targetProjectId: project.id })
    const result = await answerQualityJourneyAnalysisQuestion({
      idempotencyKey: value.idempotencyKey,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        answerId: value.answerId,
        journeyId: value.journeyId,
        targetProjectId: project.id,
        analysisRevisionId: value.analysisRevisionId,
        questionId: value.questionId,
        answer: value.answer,
        actor: 'USER',
        ...(value.correctionOfAnswerId ? { correctionOfAnswerId: value.correctionOfAnswerId } : {}),
      },
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: { answerId: result.answer.answerId, replayed: result.replayed } }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function requestQualityJourneyAnalysisRevisionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = requestRevisionSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestQualityJourneyAnalysisRevision({
      expectedReviewHash: value.expectedReviewHash,
      command: {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: value.commandId,
        journeyId: value.journeyId,
        targetProjectId: project.id,
        actor: 'USER',
        command: 'REQUEST_ANALYSIS_REVISION',
        expectedStateHash: value.expectedStateHash,
        idempotencyKey: value.idempotencyKey,
        inputArtifactRefs: [
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: value.artifactId,
            revisionId: value.analysisRevisionId,
            contentHash: value.contentHash,
          },
        ],
        payload: {
          reviewedRevisionId: value.analysisRevisionId,
          reviewedHash: value.contentHash,
          feedback: value.feedback,
        },
      },
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function approveQualityJourneyAnalysisAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = reviewCommandSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await decideQualityJourneyAnalysis({
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: value.commandId,
      journeyId: value.journeyId,
      targetProjectId: project.id,
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: value.expectedStateHash,
      idempotencyKey: value.idempotencyKey,
      inputArtifactRefs: [
        {
          kind: 'ANALYSIS_CHARTER_REVISION',
          artifactId: value.artifactId,
          revisionId: value.analysisRevisionId,
          contentHash: value.contentHash,
        },
      ],
      payload: { revisionId: value.analysisRevisionId, contentHash: value.contentHash, decision: 'APPROVED' },
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

function scenarioArtifactRef(value: z.infer<typeof scenarioReviewSchema>) {
  return {
    kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
    artifactId: value.portfolioId,
    revisionId: value.portfolioRevisionId,
    contentHash: value.portfolioHash,
  }
}

export async function decideQualityJourneyScenariosAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scenarioDecisionSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await decideQualityJourneyScenarios({
      expectedReviewHash: value.expectedReviewHash,
      approvedScenarioRevisionIds: value.approvedScenarioRevisionIds,
      rejectedScenarioRevisionIds: value.rejectedScenarioRevisionIds,
      feedback: value.feedback,
      command: {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: value.commandId,
        journeyId: value.journeyId,
        targetProjectId: project.id,
        actor: 'USER',
        command: 'DECIDE_SCENARIOS',
        expectedStateHash: value.expectedStateHash,
        idempotencyKey: value.idempotencyKey,
        inputArtifactRefs: [scenarioArtifactRef(value)],
        payload: {
          portfolioRevisionId: value.portfolioRevisionId,
          portfolioHash: value.portfolioHash,
          approvedScenarioRevisionIds: value.approvedScenarioRevisionIds,
          rejectedScenarioRevisionIds: value.rejectedScenarioRevisionIds,
          ...(value.feedback ? { feedback: value.feedback } : {}),
        },
      },
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function commentQualityJourneyScenarioPortfolioAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scenarioCommentSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await commentQualityJourneyScenarioPortfolio({
      ...value,
      targetProjectId: project.id,
      actor: 'USER',
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 201, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function disposeQualityJourneyScenarioCommentAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scenarioCommentDispositionSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await disposeQualityJourneyScenarioComment({ ...value, targetProjectId: project.id, actor: 'USER' })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}

export async function requestQualityJourneyScenarioRevisionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scenarioRevisionRequestSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestQualityJourneyScenarioRevision({
      expectedReviewHash: value.expectedReviewHash,
      command: {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: value.commandId,
        journeyId: value.journeyId,
        targetProjectId: project.id,
        actor: 'USER',
        command: 'REQUEST_SCENARIO_REVISION',
        expectedStateHash: value.expectedStateHash,
        idempotencyKey: value.idempotencyKey,
        inputArtifactRefs: [scenarioArtifactRef(value)],
        payload: {
          reviewedRevisionId: value.portfolioRevisionId,
          reviewedHash: value.portfolioHash,
          feedback: value.feedback,
        },
      },
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return qualityJourneyActionError(error)
  }
}
