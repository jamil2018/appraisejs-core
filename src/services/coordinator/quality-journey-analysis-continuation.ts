import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession, type CoordinatorSessionBinding } from './quality-journey-coordinator-session'

function continuationOutcome(status: string, humanWait: boolean, physicalDependency: boolean) {
  if (status !== 'ACTIVE') return 'INACTIVE'
  if (humanWait) return 'HUMAN_WAIT'
  if (physicalDependency) return 'PHYSICAL_RECONCILIATION_REQUIRED'
  return 'CANONICAL_ANALYSIS_STATE_OBSERVED'
}

/** Internal observation only. No claim, permit, lease renewal or dispatch follows this result. */
export async function inspectQualityJourneyAnalysisContinuation(
  input: CoordinatorSessionBinding,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const { journey, session } = await assertCurrentCoordinatorSession(input, tx)
    if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || !session)
      throw new ServiceError('Analysis continuation requires an explicit internal managed Journey.', 'CONFLICT')
    const items = await tx.qualityJourneyWorkItem.findMany({
      where: {
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'REQUIREMENT_ANALYZER',
      },
      select: { id: true, version: true, inputHash: true, currentAttempt: true, status: true },
      orderBy: { id: 'asc' },
      take: 100,
    })
    // The hub is global to this database. Another Journey's uncertain slot also blocks dispatch.
    const slot = await tx.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } })
    const unresolved = await tx.qualityJourneyProviderDispatchIntent.findMany({
      where: {
        run: { journeyId: journey.id, targetProjectId: journey.targetProjectId },
        armedAt: { not: null },
        OR: [{ reconciledAt: null }, { run: { status: 'CONFLICT' } }],
      },
      select: { id: true, providerRunId: true, sendBoundaryId: true, claimEpoch: true, providerNamespace: true },
      orderBy: { id: 'asc' },
      take: 100,
    })
    const humanWait =
      JSON.parse(journey.unresolvedQuestionIdsJson).length > 0 || JSON.parse(journey.blockerIdsJson).length > 0
    const occupiedIntentId = slot?.intentId ?? null
    const physicalDependency = Boolean(occupiedIntentId) || unresolved.length > 0
    const outcome = continuationOutcome(journey.status, humanWait, physicalDependency)
    const identity = {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      sessionId: session.id,
      coordinatorGeneration: session.generation,
      cycleId: journey.activeCycleId,
      revisions: journey.activeRevisionIdsJson,
      reviewHash: journey.analysisReviewHash,
      stateHash: journey.stateHash,
      status: journey.status,
      outcome,
      occupiedIntentId,
      unresolved,
      items,
    }
    return {
      outcome,
      observationKey: `sha256:${createHash('sha256').update(canonicalContractJson(identity)).digest('hex')}`,
      work: items,
      physicalDependency,
      unresolved,
      occupiedIntentId,
      dispatchAuthorized: false as const,
      runtimeQualified: false as const,
    }
  })
}
