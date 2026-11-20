import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { analysisAnswerSchema, analysisCharterSchema } from '@/lib/quality-journey'
import type { CanonicalMcpDefinition } from '@/lib/quality-journey/managed-worker-gateway'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const appManagedAnalysisArgumentsSchema = z
  .object({
    idempotencyKey: id,
    predecessorAnalysisRevisionId: id.optional(),
    charter: analysisCharterSchema.innerType().omit({ schemaVersion: true, journeyId: true, targetProjectId: true }),
  })
  .strict()

export const appManagedAnalysisOutputSchema = z
  .object({
    toolName: z.literal('quality_journey_analysis_submit'),
    arguments: appManagedAnalysisArgumentsSchema,
  })
  .strict()

/** Canonical Analyzer shape from the same root contracts enforced by the submission gateway. */
export const appManagedAnalysisDefinitions: readonly CanonicalMcpDefinition[] = [
  { kind: 'tool', name: 'quality_journey_analysis_get', inputSchema: zodToJsonSchema(z.object({}).strict()) },
  {
    kind: 'tool',
    name: 'quality_journey_analysis_submit',
    inputSchema: zodToJsonSchema(appManagedAnalysisArgumentsSchema),
  },
]

/** IDs are resolution links for this single transition, not a cumulative answer history. */
export function appManagedAnalysisAnswerResolutionContract(
  followup: {
    predecessor: { data: unknown }
    questions: Array<{ currentAnswer: { data: unknown } | null }>
  } | null,
) {
  if (!followup)
    return {
      allowedResolvedQuestionAnswerIds: [] as string[],
      inheritedAnswerIdsNotEligibleForResolution: [] as string[],
    }
  const predecessor = analysisCharterSchema.parse(followup.predecessor.data)
  const currentAnswers = followup.questions.flatMap(question =>
    question.currentAnswer ? [analysisAnswerSchema.parse(question.currentAnswer.data)] : [],
  )
  if (currentAnswers.some(answer => answer.analysisRevisionId !== predecessor.analysisRevisionId))
    throw new Error('Analysis answer resolution contract requires only immediate predecessor answers.')
  const allowedResolvedQuestionAnswerIds = currentAnswers.map(answer => answer.answerId).sort()
  if (new Set(allowedResolvedQuestionAnswerIds).size !== allowedResolvedQuestionAnswerIds.length)
    throw new Error('Analysis answer resolution contract has duplicate current heads.')
  return {
    allowedResolvedQuestionAnswerIds,
    inheritedAnswerIdsNotEligibleForResolution: [...predecessor.resolvedQuestionAnswerIds].sort(),
  }
}
