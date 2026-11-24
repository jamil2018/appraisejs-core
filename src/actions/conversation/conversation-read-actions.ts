'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { createChatGptReadProvider } from '@/services/conversation/chatgpt-read-provider'
import {
  releaseUnconfirmedConversationRead,
  setConversationReadProvider,
  verifyConversationLookup,
} from '@/services/conversation/conversation-read-service'
import {
  chatGptConnection,
  isChatGptConnectionSupported,
} from '@/services/provider-connection/chatgpt-connection-service'
import { ServiceError } from '@/services/shared/errors'

const scope = z.object({ projectId: qualityJourneyIdentifierSchema, conversationId: z.string().uuid() })
const mode = scope.extend({ provider: z.enum(['LOCAL', 'CHATGPT']) }).strict()
const verify = scope.extend({ messageId: z.string().uuid(), profileKey: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
const release = scope.extend({ attemptId: z.string().uuid() }).strict()

async function scopedReadAction<T extends { projectId: string; conversationId: string }>(
  schema: z.ZodType<T>,
  input: unknown,
  run: (value: T & { targetProjectId: string }) => Promise<unknown>,
) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: 'Choose a valid conversation and read.' }
  try {
    const project = await requireActiveProjectForMutation()
    if (project.id !== parsed.data.projectId)
      throw new ServiceError('This chat belongs to a different project.', 'CONFLICT')
    await run({ ...parsed.data, targetProjectId: project.id })
    revalidatePath(`/conversations/${parsed.data.conversationId}`)
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof ServiceError ? error.message : 'Could not update the provider read. Reload this chat.',
    }
  }
}

export async function selectConversationReadProvider(input: unknown) {
  return scopedReadAction(mode, input, value => setConversationReadProvider(value, value.provider))
}

export async function runConversationChatGptLookup(input: unknown) {
  return scopedReadAction(verify, input, async value => {
    const readToken = () => chatGptConnection.readLookupAccessToken(value.profileKey)
    const token = isChatGptConnectionSupported() ? await readToken() : undefined
    if (!token)
      throw new ServiceError('The ChatGPT connection changed. Reload the chat and review the lookup.', 'CONFLICT')
    await verifyConversationLookup(value, createChatGptReadProvider(readToken))
  })
}

export async function acknowledgeUnconfirmedRead(input: unknown) {
  return scopedReadAction(release, input, releaseUnconfirmedConversationRead)
}
