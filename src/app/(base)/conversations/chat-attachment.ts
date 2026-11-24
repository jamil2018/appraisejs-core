import { notFound } from 'next/navigation'

import { chatContextFromJourney } from '@/lib/conversation/chat-context'
import { journeyRecordReferenceSchema } from '@/lib/quality-journey/record-context'
import { loadJourneyRecordContext } from '@/services/coordinator/quality-journey-record-context'

export type ContextParams = { project?: string; kind?: string; record?: string }

export async function loadChatAttachment(projectId: string, { kind, record }: ContextParams) {
  if (kind === undefined && record === undefined) return undefined
  const reference = journeyRecordReferenceSchema.safeParse({ kind, id: record })
  if (!reference.success) notFound()
  const context = (await loadJourneyRecordContext(projectId, reference.data)) ?? notFound()
  return chatContextFromJourney(context)
}
