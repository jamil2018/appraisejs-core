import type { Prisma, PrismaClient, QualityJourneyWorkItem, QualityJourneyWorkAuthorization } from '@prisma/client'
import { providerIntentPolicy } from '@/lib/quality-journey/provider-intent-contract'

/** One canonical read of both independent ceilings, used at discovery, issuance and fresh claim. */
export async function readAnalysisFollowupAttemptBudget(
  item: Pick<QualityJourneyWorkItem, 'id' | 'currentAttempt'>,
  authorization: Pick<QualityJourneyWorkAuthorization, 'id' | 'maxAttempts'>,
  tx: PrismaClient | Prisma.TransactionClient,
) {
  const [authorizationAttempts, lifetimeAttempts] = await Promise.all([
    tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: authorization.id } }),
    tx.qualityJourneyWorkAttempt.count({ where: { workItemId: item.id } }),
  ])
  return {
    authorizationAttempts,
    authorizationMaxAttempts: authorization.maxAttempts,
    lifetimeAttempts,
    currentAttempt: item.currentAttempt,
    maxAttempts: providerIntentPolicy.maxAttempts,
  }
}
