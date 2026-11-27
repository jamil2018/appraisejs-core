'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import {
  approveConversationExecution,
  requestConversationExecution,
} from '@/services/conversation/conversation-execution-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'

const scope = z.object({ conversationId: z.string().uuid(), journeyId: qualityJourneyIdentifierSchema }).strict()
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const request = scope.extend({
  environmentId: qualityJourneyIdentifierSchema,
  browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']),
  expectedStateHash: digest,
})
const approve = scope.extend({
  executionConsentId: qualityJourneyIdentifierSchema,
  expectedScopeHash: digest,
})

async function execute<T extends z.infer<typeof scope>>(
  schema: z.ZodType<T>,
  input: unknown,
  run: (input: T & { targetProjectId: string }) => Promise<unknown>,
) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false as const, status: 400, error: 'Invalid run permission request.' }
  const { conversationId, journeyId } = parsed.data

  try {
    const project = await requireActiveProjectForMutation()
    await run({ ...parsed.data, targetProjectId: project.id })
    revalidatePath(`/conversations/${conversationId}`)
    revalidatePath(`/quality-journeys/${journeyId}`)
    return { success: true as const }
  } catch (error) {
    const response =
      error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
    return {
      success: false as const,
      status: response.status,
      error: response.error ?? 'Couldn’t confirm this request. Check the saved run activity.',
    }
  }
}

export async function requestChatJourneyExecutionPermission(input: unknown) {
  return execute(request, input, requestConversationExecution)
}

export async function approveChatJourneyExecutionPermission(input: unknown) {
  return execute(approve, input, approveConversationExecution)
}
