import { z } from 'zod'

import { analysisAnswerSchema, qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  getQualityJourneyAnalysis,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
  submitQualityJourneyAnalysisSuccessor,
} from '@/services/coordinator/quality-journey-analysis-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const text = z.string().trim().min(1).max(8_000)
const target = z.string().min(1)
const publicAnalysisCharterSchema = z
  .object({
    charterId: id,
    analysisRevisionId: id,
    cycleId: id,
    requirementRevisionId: id,
    objectives: z.array(text).min(1).max(64),
    scope: z.object({ included: z.array(text).min(1).max(128), excluded: z.array(text).max(128) }).strict(),
    actors: z.array(text).max(128),
    requirements: z
      .array(z.object({ requirementId: id, statement: text, sourceRefs: z.array(text).min(1).max(64) }).strict())
      .min(1)
      .max(512),
    obligations: z
      .array(
        z
          .object({
            obligationId: id,
            requirementId: id,
            statement: text,
            acceptanceSignals: z.array(text).min(1).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(512),
    constraints: z.array(text).max(256),
    assumptions: z.array(text).max(256),
    risks: z.array(text).max(256),
    acceptanceSignals: z.array(text).min(1).max(256),
    retiredRequirementIds: z.array(id).max(512),
    questions: z
      .array(z.object({ questionId: id, prompt: text, required: z.boolean(), rationale: text }).strict())
      .max(256),
    resolvedQuestionAnswerIds: z.array(id).max(256),
  })
  .strict()

const commandBaseSchema = z
  .object({
    target,
    commandId: id,
    expectedStateHash: hash,
    idempotencyKey: id,
    charterId: id,
    analysisRevisionId: id,
    contentHash: hash,
  })
  .strict()
const submissionSchema = z
  .object({
    target,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1).max(2_000),
    idempotencyKey: id,
    predecessorAnalysisRevisionId: id.optional(),
    charter: publicAnalysisCharterSchema,
  })
  .strict()
const answerSchema = z
  .object({ target, idempotencyKey: id })
  .extend(analysisAnswerSchema.omit({ schemaVersion: true, journeyId: true, targetProjectId: true, actor: true }).shape)
  .strict()
const publicationSchema = commandBaseSchema
const revisionRequestSchema = commandBaseSchema.extend({ expectedReviewHash: hash, feedback: text }).strict()
const decisionSchema = commandBaseSchema

type CommandInput = z.infer<typeof commandBaseSchema>
type AnalysisPostHandler = (journeyId: string, body: unknown) => Promise<Response>

function commandBase(input: CommandInput, journeyId: string, targetProjectId: string) {
  return {
    schemaVersion: qualityJourneyContractVersion,
    commandId: input.commandId,
    journeyId,
    targetProjectId,
    expectedStateHash: input.expectedStateHash,
    idempotencyKey: input.idempotencyKey,
    inputArtifactRefs: [
      {
        kind: 'ANALYSIS_CHARTER_REVISION' as const,
        artifactId: input.charterId,
        revisionId: input.analysisRevisionId,
        contentHash: input.contentHash,
      },
    ],
  }
}

async function submit(journeyId: string, body: unknown): Promise<Response> {
  const value = submissionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await submitQualityJourneyAnalysisSuccessor({
      workItemId: value.workItemId,
      attemptId: value.attemptId,
      leaseId: value.leaseId,
      ownerToken: value.ownerToken,
      idempotencyKey: value.idempotencyKey,
      ...(value.predecessorAnalysisRevisionId
        ? { predecessorAnalysisRevisionId: value.predecessorAnalysisRevisionId }
        : {}),
      journeyId,
      targetProjectId: resolvedTarget.id,
      charter: {
        ...value.charter,
        schemaVersion: qualityJourneyContractVersion,
        journeyId,
        targetProjectId: resolvedTarget.id,
      },
    }),
    { status: 201 },
  )
}

async function answer(journeyId: string, body: unknown): Promise<Response> {
  const value = answerSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await answerQualityJourneyAnalysisQuestion({
      idempotencyKey: value.idempotencyKey,
      answer: {
        answerId: value.answerId,
        analysisRevisionId: value.analysisRevisionId,
        questionId: value.questionId,
        answer: value.answer,
        ...(value.correctionOfAnswerId ? { correctionOfAnswerId: value.correctionOfAnswerId } : {}),
        schemaVersion: qualityJourneyContractVersion,
        journeyId,
        targetProjectId: resolvedTarget.id,
        actor: 'USER',
      },
    }),
    { status: 201 },
  )
}

async function publish(journeyId: string, body: unknown): Promise<Response> {
  const value = publicationSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await publishQualityJourneyAnalysis({
      ...commandBase(value, journeyId, resolvedTarget.id),
      actor: 'RUNNER',
      command: 'PUBLISH_ANALYSIS',
      payload: { artifactRevisionId: value.analysisRevisionId, artifactHash: value.contentHash },
    }),
  )
}

async function requestRevision(journeyId: string, body: unknown): Promise<Response> {
  const value = revisionRequestSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await requestQualityJourneyAnalysisRevision({
      expectedReviewHash: value.expectedReviewHash,
      command: {
        ...commandBase(value, journeyId, resolvedTarget.id),
        actor: 'USER',
        command: 'REQUEST_ANALYSIS_REVISION',
        payload: {
          reviewedRevisionId: value.analysisRevisionId,
          reviewedHash: value.contentHash,
          feedback: value.feedback,
        },
      },
    }),
  )
}

async function decide(journeyId: string, body: unknown): Promise<Response> {
  const value = decisionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await decideQualityJourneyAnalysis({
      ...commandBase(value, journeyId, resolvedTarget.id),
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      payload: { revisionId: value.analysisRevisionId, contentHash: value.contentHash, decision: 'APPROVED' },
    }),
  )
}

const postHandlers: Readonly<Record<string, AnalysisPostHandler>> = {
  submissions: submit,
  answers: answer,
  publications: publish,
  'revision-requests': requestRevision,
  decisions: decide,
}

export async function postQualityJourneyAnalysisRoute(
  operation: string[],
  body: unknown,
): Promise<Response | undefined> {
  if (
    operation.length !== 5 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'analysis'
  )
    return undefined
  const handler = postHandlers[operation[4] ?? '']
  return handler ? handler(operation[2]!, body) : undefined
}

export async function getQualityJourneyAnalysisRoute(
  operation: string[],
  query: URLSearchParams,
): Promise<Response | undefined> {
  if (
    operation.length !== 4 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'analysis'
  )
    return undefined
  const resolvedTarget = await resolveTargetProject(target.parse(query.get('target')))
  return Response.json(
    await getQualityJourneyAnalysis({ journeyId: operation[2]!, targetProjectId: resolvedTarget.id }),
  )
}
