'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { createChatGptReadProvider } from '@/services/conversation/chatgpt-read-provider'
import { configuredMacCodexReadExecutable } from '@/services/conversation/codex-read-launcher'
import { createConfiguredCodexReadProvider } from '@/services/conversation/codex-read-runtime'
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
const engine = z.enum(['RESPONSES', 'CODEX']).optional().default('RESPONSES')
const mode = scope.extend({ provider: z.enum(['LOCAL', 'CHATGPT']), engine }).strict()
const verify = scope
  .extend({ messageId: z.string().uuid(), profileKey: z.string().regex(/^[0-9a-f]{64}$/), engine })
  .strict()
const release = scope.extend({ attemptId: z.string().uuid() }).strict()

function requireNativeCodexConfiguration() {
  if (process.platform !== 'darwin' || !configuredMacCodexReadExecutable()) {
    throw new ServiceError('Native Codex is unavailable in this app session.', 'CONFLICT')
  }
}

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
  return scopedReadAction(mode, input, value => {
    if (value.provider === 'CHATGPT' && value.engine === 'CODEX') requireNativeCodexConfiguration()
    return setConversationReadProvider(value, value.provider, undefined, value.engine)
  })
}

export async function runConversationChatGptLookup(input: unknown) {
  return scopedReadAction(verify, input, async value => {
    if (value.engine === 'CODEX') requireNativeCodexConfiguration()
    const readToken = () => chatGptConnection.readLookupAccessToken(value.profileKey)
    const token = isChatGptConnectionSupported() ? await readToken() : undefined
    if (!token)
      throw new ServiceError('The ChatGPT connection changed. Reload the chat and review the lookup.', 'CONFLICT')
    const provider =
      value.engine === 'CODEX' ? createConfiguredCodexReadProvider(readToken) : createChatGptReadProvider(readToken)
    await verifyConversationLookup({ ...value, expectedEngine: value.engine }, provider)
  })
}

export async function acknowledgeUnconfirmedRead(input: unknown) {
  return scopedReadAction(release, input, releaseUnconfirmedConversationRead)
}
