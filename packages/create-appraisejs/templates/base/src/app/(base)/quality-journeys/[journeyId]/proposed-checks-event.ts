import { EventType, type ToolCall, type ToolCallChunkEvent } from '@ag-ui/core'
import { ToolCallChunkEventSchema } from '@ag-ui/core/schemas'
import { z } from 'zod'

export const analysisReviewToolName = 'appraise_show_analysis_review'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const reviewIdentitySchema = z.object({
  conversationId: z.string().uuid(),
  projectId: id,
  journeyId: id,
  revisionId: id,
  reviewHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
})

const check = z.string().trim().min(1).max(8_000)
const criterionChange = z
  .object({
    id,
    kind: z.enum(['added', 'changed', 'removed']),
    statement: check,
    signals: z.array(check).min(1).max(64),
  })
  .strict()
const reviewContent = reviewIdentitySchema.extend({
  revision: z.number().int().positive().safe(),
  includedScope: z.array(check).min(1).max(128),
})
const publishedReviewContent = reviewContent.extend({ approvable: z.boolean().optional() })
export const analysisReviewContentSchema = z.discriminatedUnion('kind', [
  publishedReviewContent
    .extend({ kind: z.literal('proposed-checks'), checks: z.array(check).min(1).max(256) })
    .strict(),
  publishedReviewContent
    .extend({ kind: z.literal('review-changes'), changes: z.array(criterionChange).max(1024) })
    .strict(),
  reviewContent
    .extend({
      kind: z.literal('question'),
      prompt: check,
      rationale: check,
      choices: z.array(check).max(6),
    })
    .strict(),
])

type ReviewIdentity = z.infer<typeof reviewIdentitySchema>
export type AnalysisReviewContent = z.infer<typeof analysisReviewContentSchema>

function callId({ conversationId, projectId, journeyId, revisionId, reviewHash }: ReviewIdentity) {
  return JSON.stringify([analysisReviewToolName, conversationId, projectId, journeyId, revisionId, reviewHash])
}

export function analysisReviewEvent(content: AnalysisReviewContent): ToolCallChunkEvent {
  return {
    type: EventType.TOOL_CALL_CHUNK,
    toolCallName: analysisReviewToolName,
    toolCallId: callId(content),
    delta: JSON.stringify(content),
  }
}

/** Select one complete presentation call for the already verified review. */
export function readAnalysisReviewCall(events: readonly unknown[], expected: ReviewIdentity): ToolCall | undefined {
  const id = callId(expected)
  for (const event of events) {
    const chunk = ToolCallChunkEventSchema.safeParse(event)
    if (!chunk.success || chunk.data.toolCallName !== analysisReviewToolName || chunk.data.toolCallId !== id) continue
    const { delta } = chunk.data
    if (!delta) continue

    try {
      const content = analysisReviewContentSchema.safeParse(JSON.parse(delta))
      if (content.success && callId(content.data) === id)
        return {
          id,
          type: 'function',
          function: { name: analysisReviewToolName, arguments: JSON.stringify(content.data) },
        }
    } catch {
      // A partial or malformed JSON chunk cannot render a review.
    }
  }
}
