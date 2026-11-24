'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { chatContextKinds } from '@/lib/conversation/chat-context'
import { parseAttachedCaseRename, parseWorkspaceRequest } from '@/lib/conversation/workspace-request'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { appendConversationTurn, replayConversationTurn } from '@/services/conversation/conversation-service'
import { loadChatContext } from '@/services/conversation/chat-context-service'
import { ServiceError, unknownErrorToActionResponse } from '@/services/shared/errors'
import { answerWorkspaceRequest } from '@/services/workspace-search/workspace-record-search'

const order = z
  .object({
    projectId: qualityJourneyIdentifierSchema,
    conversationId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid(),
    content: z.string().trim().min(1).max(8000),
    context: z
      .object({
        kind: z.enum(chatContextKinds),
        id: qualityJourneyIdentifierSchema,
        shownTitle: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

async function verifyContext(projectId: string, reference: z.infer<typeof order>['context']) {
  if (!reference) return undefined
  const record = await loadChatContext(projectId, reference)
  if (!record) throw new ServiceError('The attached record is unavailable in this project.', 'NOT_FOUND')
  return record
}

function requireRenameContext(context: Awaited<ReturnType<typeof verifyContext>>, shownTitle: string | undefined) {
  if (context?.kind !== 'TEST_CASE') {
    throw new ServiceError('Attach a test case before renaming it in chat.', 'VALIDATION')
  }
  if (shownTitle !== context.title) {
    throw new ServiceError('The case name changed. Attach it again to review its current name.', 'CONFLICT')
  }
}

export async function submitConversationMessage(input: unknown) {
  const result = order.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Enter a message of 1–8,000 characters.' }
  const { projectId, conversationId, idempotencyKey, content } = result.data
  try {
    const project = await requireActiveProjectForMutation()
    if (project.id !== projectId) throw new ServiceError('This chat belongs to a different project.', 'CONFLICT')
    const turn = { targetProjectId: project.id, conversationId, idempotencyKey, content }
    const existing = await replayConversationTurn({ ...turn, context: result.data.context })
    if (existing) return { success: true as const, conversationId: existing.conversation.id }
    const context = await verifyContext(project.id, result.data.context)
    const renameAttachedCaseTo = parseAttachedCaseRename(content)
    if (renameAttachedCaseTo !== undefined) requireRenameContext(context, result.data.context?.shownTitle)
    const request = parseWorkspaceRequest(content)
    const reply = request ? await answerWorkspaceRequest(project.id, request) : undefined
    const resultTurn = await appendConversationTurn({ ...turn, context, reply, renameAttachedCaseTo })
    if (renameAttachedCaseTo !== undefined) revalidatePath('/test-cases')
    revalidatePath('/conversations')
    return { success: true as const, conversationId: resultTurn.conversation.id }
  } catch (error) {
    const response = unknownErrorToActionResponse(error)
    return { success: false as const, error: response.error ?? 'Couldn’t save your message.' }
  }
}
