import type { PrismaClient } from '@prisma/client'

import { sharedResourceDigest, type SharedResourceKind } from '@/lib/quality-journey/shared-resource-contract'
import type { SharedResourceMutationKey } from '@/services/coordinator/quality-journey-shared-resource-guard-service'

/** Synthetic coverage for known roots in disposable SQLite fixtures with no Journeys. */
export async function completeCollaborationFixtureCoverage(
  client: PrismaClient,
  targetProjectId: string,
  kinds: SharedResourceKind[],
  unguardedRoots: SharedResourceMutationKey[] = [],
) {
  await client.$transaction(async tx => {
    for (const { kind, resourceId } of unguardedRoots) {
      await tx.qualityJourneySharedResourceGuard.create({
        data: {
          targetProjectId,
          kind,
          resourceId,
          coverageState: 'COMPLETE_V1',
          coverageDigest: sharedResourceDigest('M06_SYNTHETIC_COLLABORATION_FIXTURE_ROOT_V1', {
            targetProjectId,
            kind,
            resourceId,
          }),
        },
      })
    }

    const completedAt = new Date()
    for (const kind of kinds) {
      const identity = { targetProjectId, kind, protocolVersion: 1 }
      await tx.qualityJourneySharedResourceCoverage.update({
        where: { targetProjectId_kind_protocolVersion: identity },
        data: {
          state: 'COMPLETE',
          epoch: { increment: 1 },
          proofKind: 'JOURNEY_FREE_V1',
          completedAt,
          writerClosureDigest: sharedResourceDigest('M06_SYNTHETIC_COLLABORATION_FIXTURE_WRITER_V1', identity),
          readerClosureDigest: sharedResourceDigest('M06_SYNTHETIC_COLLABORATION_FIXTURE_READER_V1', identity),
          sourceUniverseDigest: sharedResourceDigest('M06_SYNTHETIC_COLLABORATION_FIXTURE_UNIVERSE_V1', identity),
          reconciliationDigest: sharedResourceDigest('M06_SYNTHETIC_COLLABORATION_FIXTURE_RECONCILIATION_V1', identity),
        },
      })
    }
  })
}
