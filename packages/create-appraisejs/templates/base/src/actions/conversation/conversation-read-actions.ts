'use server'

import { platform } from 'node:os'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { createChatGptReadProvider } from '@/services/conversation/chatgpt-read-provider'
import { createClaudeCodeReadProvider } from '@/services/conversation/claude-code-read-provider'
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
import { getClaudeCodeConnection } from '@/services/provider-connection/claude-code-connection-service'
import { ServiceError } from '@/services/shared/errors'

const scope = z.object({ projectId: qualityJourneyIdentifierSchema, conversationId: z.string().uuid() })
const engine = z.enum(['RESPONSES', 'CODEX']).optional().default('RESPONSES')
const mode = z.discriminatedUnion('provider', [
  scope.extend({ provider: z.literal('LOCAL'), engine }).strict(),
  scope.extend({ provider: z.literal('CHATGPT'), engine }).strict(),
  scope.extend({ provider: z.literal('CLAUDE'), engine: z.literal('CLAUDE_CODE') }).strict(),
])
const verify = scope
  .extend({ messageId: z.string().uuid(), profileKey: z.string().regex(/^[0-9a-f]{64}$/), engine })
  .strict()
const verifyClaude = scope.extend({ messageId: z.string().uuid(), engine: z.literal('CLAUDE_CODE') }).strict()
const release = scope.extend({ attemptId: z.string().uuid() }).strict()

function requireNativeCodexConfiguration() {
  if (platform() !== 'darwin' || !configuredMacCodexReadExecutable()) {
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
  return scopedReadAction(mode, input, async value => {
    if (value.provider === 'CHATGPT' && value.engine === 'CODEX') requireNativeCodexConfiguration()
    if (value.provider === 'CLAUDE') {
      const connection = await getClaudeCodeConnection()
      if (connection.state === 'unavailable') {
        throw new ServiceError('Claude Code is unavailable in this app session.', 'CONFLICT')
      }
    }
    return setConversationReadProvider(
      value,
      value.provider,
      undefined,
      value.provider === 'CLAUDE' ? 'RESPONSES' : value.engine,
    )
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

export async function runConversationClaudeCodeLookup(input: unknown) {
  return scopedReadAction(verifyClaude, input, async value => {
    const connection = await getClaudeCodeConnection()
    if (connection.state !== 'connected') {
      throw new ServiceError('Connect Claude Code in Settings, then review this lookup again.', 'CONFLICT')
    }
    const provider = await createClaudeCodeReadProvider()
    await verifyConversationLookup({ ...value, expectedEngine: 'CLAUDE_CODE' }, provider)
  })
}

export async function acknowledgeUnconfirmedRead(input: unknown) {
  return scopedReadAction(release, input, releaseUnconfirmedConversationRead)
}
