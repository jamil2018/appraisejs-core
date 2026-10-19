import type { Prisma } from '@prisma/client'
import { ServiceError } from '@/services/shared/errors'

type Scope = { journeyId: string; targetProjectId: string }
type RunScope = Scope & { workItemId?: string; attemptId?: string }
const runScope = (scope: RunScope) => ({
  journeyId: scope.journeyId,
  targetProjectId: scope.targetProjectId,
  ...(scope.workItemId ? { workItemId: scope.workItemId } : {}),
  ...(scope.attemptId ? { attemptId: scope.attemptId } : {}),
})

/** Physical uncertainty survives logical cancellation, expiry and accepted output. */
export async function hasUnreconciledProviderEffects(scope: RunScope, tx: Prisma.TransactionClient) {
  const [intents, slots] = await Promise.all([
    tx.qualityJourneyProviderDispatchIntent.count({
      where: {
        run: runScope(scope),
        armedAt: { not: null },
        OR: [{ reconciledAt: null }, { run: { status: 'CONFLICT' } }],
      },
    }),
    tx.qualityJourneyProviderSlot.count({ where: { run: runScope(scope) } }),
  ])
  return intents > 0 || slots > 0
}

export async function assertProviderEffectsQuiescent(scope: Scope, tx: Prisma.TransactionClient) {
  const pending = await tx.qualityJourneyProviderDispatchIntent.count({
    where: { run: runScope(scope), reconciledAt: null, invalidatedAt: null },
  })
  if (pending || (await hasUnreconciledProviderEffects(scope, tx)))
    throw new ServiceError(
      'Provider intent or physical effects require reconciliation before transfer or resume.',
      'CONFLICT',
    )
}

/** Invalidate only provably unsent work; an armed marker is never cleared. */
export async function invalidateUnsentProviderIntents(scope: RunScope, tx: Prisma.TransactionClient) {
  const now = new Date()
  await tx.qualityJourneyProviderDispatchIntent.updateMany({
    where: { run: runScope(scope), armedAt: null, invalidatedAt: null, reconciledAt: null },
    data: { status: 'INVALIDATED', invalidatedAt: now },
  })
  await tx.qualityJourneyProviderRun.updateMany({
    where: { ...runScope(scope), intents: { every: { armedAt: null, invalidatedAt: { not: null } } } },
    data: { status: 'INVALIDATED' },
  })
}

export async function assertProviderReplacementSafe(scope: RunScope, tx: Prisma.TransactionClient) {
  if (await hasUnreconciledProviderEffects(scope, tx))
    throw new ServiceError(
      'A prior provider run may still have effects; replacement requires reconciliation.',
      'CONFLICT',
    )
}
