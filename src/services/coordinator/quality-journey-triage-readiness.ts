import type { Prisma, QualityJourney, QualityJourneyWorkItem } from '@prisma/client'

type Readiness = (
  journey: QualityJourney,
  item: QualityJourneyWorkItem,
  tx: Prisma.TransactionClient,
) => Promise<unknown>
let reader: Readiness | undefined

export function registerInternalTriagerReadiness(value: Readiness) {
  reader = value
}

export function getInternalTriagerReadiness() {
  return reader
}
