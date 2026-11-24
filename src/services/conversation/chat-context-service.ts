import prisma from '@/config/db-config'
import {
  chatContextFromJourney,
  journeyReferenceFromChat,
  type ChatContextReference,
} from '@/lib/conversation/chat-context'
import { qualityJourneyRequirementSummary } from '@/lib/quality-journey/presentation'
import { loadJourneyRecordContext } from '@/services/coordinator/quality-journey-record-context'

export async function loadChatContext(projectId: string, { kind, id }: ChatContextReference) {
  if (kind === 'QUALITY_JOURNEY') {
    const journey = await prisma.qualityJourney.findFirst({
      where: { id, targetProjectId: projectId },
      select: {
        id: true,
        revisions: { orderBy: { revision: 'asc' }, take: 1, select: { contentJson: true } },
      },
    })
    if (!journey) return undefined
    const revision = journey.revisions[0]?.contentJson
    const title = revision ? qualityJourneyRequirementSummary(revision).split('\n')[0].trim().slice(0, 512) : ''
    return { kind, id: journey.id, title: title || 'Quality Journey' }
  }
  const record = await loadJourneyRecordContext(projectId, journeyReferenceFromChat({ kind, id }))
  return record && chatContextFromJourney(record)
}
