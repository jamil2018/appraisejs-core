import { Prisma, type PrismaClient } from '@prisma/client'

import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * A coordinator session is intentionally an ingress fence, not a worker role
 * or a replacement for Appraise-owned human decisions. Once a takeover is
 * effective, every coordinator-facing mutation must present this exact pair.
 */
export type CoordinatorSessionBinding = {
  journeyId: string
  targetProjectId: string
  coordinatorHandoffId?: string
  coordinatorGeneration?: number
}

export type CoordinatorSessionCredentials = Pick<
  CoordinatorSessionBinding,
  'coordinatorHandoffId' | 'coordinatorGeneration'
>

/** Recheck the request-bound generation inside the mutation transaction. */
export async function assertCoordinatorMutationSession(
  session: CoordinatorSessionCredentials | undefined,
  scope: Pick<CoordinatorSessionBinding, 'journeyId' | 'targetProjectId'>,
  client: Db,
) {
  await assertCoordinatorRecoverySession(session, scope, client)
  const journey = await client.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    select: { stage: true, status: true, updatedAt: true },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  if (journey.status === 'PAUSED')
    throw new ServiceError('Quality Journey is paused. Reconcile owned work before resuming.', 'CONFLICT')
  if (journey.status === 'ACTIVE') {
    const admission = await client.qualityJourney.updateMany({
      where: { id: scope.journeyId, targetProjectId: scope.targetProjectId, status: 'ACTIVE' },
      data: { status: 'ACTIVE', updatedAt: journey.updatedAt },
    })
    if (admission.count !== 1)
      throw new ServiceError('Quality Journey operational admission changed concurrently.', 'CONFLICT')
  }
}

/** Cleanup and reconciliation retain the exact coordinator generation while paused. */
export async function assertCoordinatorRecoverySession(
  session: CoordinatorSessionCredentials | undefined,
  scope: Pick<CoordinatorSessionBinding, 'journeyId' | 'targetProjectId'>,
  client: Db,
) {
  if (!session) return
  await assertCurrentCoordinatorSession({ ...scope, ...session }, client)
}

export async function assertCurrentCoordinatorSession(input: CoordinatorSessionBinding, client: Db) {
  const effective = await client.qualityJourneyCoordinatorHandoff.findFirst({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId, takeoverAt: { not: null } },
    orderBy: [{ generation: 'desc' }, { id: 'desc' }],
    select: { id: true, generation: true, status: true, fencedAt: true },
  })
  if (!effective) return
  if (
    effective.status !== 'CONNECTED' ||
    effective.fencedAt ||
    input.coordinatorHandoffId !== effective.id ||
    input.coordinatorGeneration !== effective.generation
  )
    throw new ServiceError(
      'Coordinator session generation is not current for this Journey and target.',
      'UNAUTHORIZED',
      403,
    )
}
