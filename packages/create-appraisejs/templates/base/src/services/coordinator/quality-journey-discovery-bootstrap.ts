import type { Prisma } from '@prisma/client'
import type { BeforeJourneyBusinessWrite } from './quality-journey-business-write-join'

type DiscoveryBootstrap = (
  input: { journeyId: string; targetProjectId: string },
  tx: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
) => Promise<unknown>

let discoveryBootstrap: DiscoveryBootstrap | undefined

export function registerQualityJourneyDiscoveryBootstrap(bootstrap: DiscoveryBootstrap) {
  discoveryBootstrap = bootstrap
}

export function getQualityJourneyDiscoveryBootstrap() {
  return discoveryBootstrap
}
