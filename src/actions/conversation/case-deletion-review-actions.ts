'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { caseDeletionReviewHashSchema } from '@/lib/conversation/case-deletion-review'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { decideConversationCaseDeletion } from '@/services/conversation/conversation-case-deletion-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

const decisionSchema = z
  .object({
    projectId: qualityJourneyIdentifierSchema,
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    reviewHash: caseDeletionReviewHashSchema,
    decision: z.enum(['DELETE', 'KEEP']),
  })
  .strict()

export async function decideConversationCaseDeletionAction(input: unknown) {
  const decision = decisionSchema.safeParse(input)
  if (!decision.success) return { success: false as const, error: 'Open the current review before making a decision.' }
  try {
    const { projectId, ...value } = decision.data
    const project = await requireActiveProjectForMutation()
    if (project.id !== projectId) throw new ServiceError('This review belongs to a different project.', 'CONFLICT')
    await decideConversationCaseDeletion({ targetProjectId: projectId, ...value })
    revalidatePath(`/conversations/${value.conversationId}`)
    if (value.decision === 'DELETE') revalidatePath('/test-cases')
    return { success: true as const }
  } catch (error) {
    if (error instanceof ServiceError && error.details?.reason === 'HISTORICAL_CASE_REFERENCE')
      return {
        success: false as const,
        error: 'A reviewed case has recorded history. All cases in this review are still saved.',
      }
    const response =
      error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
    return { success: false as const, error: response.error ?? 'Couldn’t save the case deletion decision.' }
  }
}
