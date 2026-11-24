import { notFound } from 'next/navigation'

import { chatContextReferenceFromJourney, type ChatContextReference } from '@/lib/conversation/chat-context'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { journeyRecordReferenceSchema } from '@/lib/quality-journey/record-context'
import { loadChatContext } from '@/services/conversation/chat-context-service'

export type ContextParams = { project?: string; kind?: string; record?: string }

function attachmentReference(kind: string | undefined, record: string | undefined): ChatContextReference {
  if (kind === 'quality-journey') {
    const id = qualityJourneyIdentifierSchema.safeParse(record)
    if (!id.success) notFound()
    return { kind: 'QUALITY_JOURNEY', id: id.data }
  }
  const reference = journeyRecordReferenceSchema.safeParse({ kind, id: record })
  if (!reference.success) notFound()
  return chatContextReferenceFromJourney(reference.data)
}

export async function loadChatAttachment(projectId: string, { kind, record }: ContextParams) {
  if (kind === undefined && record === undefined) return undefined
  return (await loadChatContext(projectId, attachmentReference(kind, record))) ?? notFound()
}
