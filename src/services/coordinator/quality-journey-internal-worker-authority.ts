import type { Prisma } from '@prisma/client'
import { ServiceError } from '@/services/shared/errors'
import {
  readCurrentExternalWorkAuthority,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

/** Shared read-only admission check for internal specialized role projections. */
export async function readInternalWorkerAuthority(
  binding: ExternalQualityJourneySubmissionBinding,
  tx: Prisma.TransactionClient,
) {
  const { item, attempt } = await readCurrentExternalWorkAuthority(binding, tx)
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: binding.journeyId } })
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    !attempt.authorizationId ||
    !attempt.externalAdmissionId ||
    item.currentAttempt !== attempt.attempt
  )
    throw new ServiceError('Internal worker admission is stale.', 'UNAUTHORIZED')
  return {
    journey,
    item,
    authorizationId: attempt.authorizationId,
    roleContractDigest: item.roleContractDigest,
    expiresAt: attempt.leaseExpiresAt.toISOString(),
  }
}
