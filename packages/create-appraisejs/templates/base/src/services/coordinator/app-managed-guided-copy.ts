import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

import { managedJourneyProvider, type ManagedJourneyProvider } from './app-managed-provider-sender'
import {
  copyQualityJourneyBriefToDraft,
  getQualityJourneyDraft,
  guidedCopyRequestHash,
} from './quality-journey-draft-service'

type GuidedCopyInput = {
  journeyId: string
  targetProjectId: string
  idempotencyKey: string
  provider: ManagedJourneyProvider
}

export async function readGuidedCopyReplay(input: GuidedCopyInput, client: Prisma.TransactionClient = prisma) {
  const existing = await client.qualityJourneyDraft.findUnique({
    where: {
      targetProjectId_createIdempotencyKey: {
        targetProjectId: input.targetProjectId,
        createIdempotencyKey: input.idempotencyKey,
      },
    },
    select: { id: true, createRequestHash: true },
  })
  if (!existing) return null
  if (existing.createRequestHash !== guidedCopyRequestHash({ journeyId: input.journeyId, provider: input.provider }))
    throw new ServiceError('This copy request was already used for another Journey or assistant.', 'CONFLICT')
  return {
    replayed: true as const,
    draft: await getQualityJourneyDraft({ draftId: existing.id, targetProjectId: input.targetProjectId }, client),
  }
}

/** Copy only an unstarted local Journey. The original Journey and its attempts are never mutated. */
export async function copyUnstartedManagedJourneyBriefWithAssistant(
  input: GuidedCopyInput,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const journey = await tx.qualityJourney.findFirst({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
      select: { hostingMode: true, managedWorkerProvider: true },
    })
    if (!journey || journey.hostingMode !== 'APP_SERVER_LOCAL_V1')
      throw new ServiceError('This saved Journey cannot be copied through assistant setup.', 'CONFLICT')
    const replay = await readGuidedCopyReplay(input, tx)
    if (replay) return replay
    if (managedJourneyProvider(journey) === input.provider)
      throw new ServiceError('Choose a different assistant for the new draft.', 'CONFLICT')
    const attempts = await tx.qualityJourneyWorkAttempt.count({
      where: { workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId } },
    })
    if (attempts > 0)
      throw new ServiceError(
        'This Journey has already started work. Its original assistant and attempts remain saved.',
        'CONFLICT',
      )

    return copyQualityJourneyBriefToDraft({ ...input, guidedCopyProvider: input.provider }, tx)
  })
}
