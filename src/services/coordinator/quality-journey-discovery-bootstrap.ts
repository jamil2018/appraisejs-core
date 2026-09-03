import type { Prisma } from '@prisma/client'

type DiscoveryBootstrap = (
  input: { journeyId: string; targetProjectId: string },
  tx: Prisma.TransactionClient,
) => Promise<unknown>

let discoveryBootstrap: DiscoveryBootstrap | undefined

export function registerQualityJourneyDiscoveryBootstrap(bootstrap: DiscoveryBootstrap) {
  discoveryBootstrap = bootstrap
}

export function getQualityJourneyDiscoveryBootstrap() {
  return discoveryBootstrap
}
