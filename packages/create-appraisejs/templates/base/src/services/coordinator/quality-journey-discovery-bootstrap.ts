import type { Prisma, QualityJourney, QualityJourneyWorkItem } from '@prisma/client'
import type { BeforeJourneyBusinessWrite } from './quality-journey-business-write-join'

type DiscoveryBootstrap = (
  input: { journeyId: string; targetProjectId: string },
  tx: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
) => Promise<unknown>

type InternalDiscoveryReadiness = (
  journey: QualityJourney,
  item: Pick<QualityJourneyWorkItem, 'id' | 'inputHash'> & { role: 'SCOUT' | 'RESOURCE_EXPLORER' },
  tx: Prisma.TransactionClient,
) => Promise<unknown>

let internalDiscoveryReadiness: InternalDiscoveryReadiness | undefined
let discoveryBootstrap: DiscoveryBootstrap | undefined

export function registerQualityJourneyDiscoveryBootstrap(
  bootstrap: DiscoveryBootstrap,
  readiness: InternalDiscoveryReadiness,
) {
  discoveryBootstrap = bootstrap
  internalDiscoveryReadiness = readiness
}

export function getQualityJourneyDiscoveryBootstrap() {
  return discoveryBootstrap
}

export function getInternalDiscoveryReadiness() {
  return internalDiscoveryReadiness
}
