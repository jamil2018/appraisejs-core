import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validateWorkerSpawnReceipt } from '@/lib/quality-journey/agent-factory'
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

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

type HistoricalDispatch = Prisma.QualityJourneyWorkAttemptGetPayload<{
  select: {
    id: true
    workItemId: true
    assignmentId: true
    status: true
    spawnRequestJson: true
    spawnRequestHash: true
    spawnReceiptJson: true
    spawnReceiptHash: true
  }
}>

function readHistoricalDispatchEvidence(attempt: HistoricalDispatch) {
  if (!attempt.spawnRequestJson || !attempt.spawnRequestHash || !attempt.spawnReceiptJson || !attempt.spawnReceiptHash)
    return null
  const request = JSON.parse(attempt.spawnRequestJson) as Record<string, unknown>
  const receipt = JSON.parse(attempt.spawnReceiptJson) as Record<string, unknown>
  if (hash(request) !== attempt.spawnRequestHash || hash(receipt) !== attempt.spawnReceiptHash) return null
  return { request, receipt }
}

function isProvenHistoricalNonstart(attempt: HistoricalDispatch) {
  if (attempt.status !== 'REFUSED') return false
  try {
    const evidence = readHistoricalDispatchEvidence(attempt)
    if (!evidence) return false
    const request = evidence.request
    if (
      request.attemptId !== attempt.id ||
      request.workItemId !== attempt.workItemId ||
      request.assignmentId !== attempt.assignmentId
    )
      return false
    return validateWorkerSpawnReceipt(evidence.receipt, request).outcome === 'REFUSED'
  } catch {
    return false
  }
}

export async function assertHistoricalHubQuiescent(tx: Prisma.TransactionClient) {
  const conflictingRun = await tx.qualityJourneyProviderRun.findFirst({
    where: { status: 'CONFLICT' },
    select: { id: true },
  })
  if (conflictingRun) conflict('Conflicting provider evidence requires reconciliation before hub reuse.')
  const historical = await tx.qualityJourneyWorkAttempt.findMany({
    where: {
      providerRun: null,
      OR: [
        { dispatchReservedAt: { not: null } },
        { dispatchStartedAt: { not: null } },
        { status: 'DISPATCH_UNRESOLVED' },
      ],
    },
    select: {
      id: true,
      workItemId: true,
      assignmentId: true,
      status: true,
      spawnRequestJson: true,
      spawnRequestHash: true,
      spawnReceiptJson: true,
      spawnReceiptHash: true,
    },
  })
  if (historical.some(attempt => !isProvenHistoricalNonstart(attempt)))
    conflict('Historical provider dispatch requires reconciliation before hub reuse.')
}
