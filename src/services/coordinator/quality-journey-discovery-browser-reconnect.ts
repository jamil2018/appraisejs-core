import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import { getQualityJourneyDiscoveryBrowserSession } from './quality-journey-discovery-browser-service'

export async function reconnectDiscoveryBrowser(scope: {
  journeyId: string
  targetProjectId: string
  discoveryRevisionId: string
}) {
  const rows = await prisma.qualityJourneyOwnedBrowser.findMany({
    where: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, status: 'LIVE' },
    select: { sessionId: true },
    take: 2,
  })
  if (rows.length !== 1) {
    throw new ServiceError(
      rows.length ? 'Multiple open browsers require reconciliation.' : 'No open scoped browser was found.',
      'CONFLICT',
    )
  }
  return getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: rows[0]!.sessionId })
}
