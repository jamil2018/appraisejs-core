import { createHash, randomUUID } from 'node:crypto'
import {
  Prisma,
  type PrismaClient,
  type QualityJourney,
  type QualityJourneyCoordinatorSession,
  type QualityJourneyOwnedBrowser,
} from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession, trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'

type Scope = { journeyId: string; targetProjectId: string }
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

async function readManagedSessionJourney(input: Scope, tx: Prisma.TransactionClient, modeError: string) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1') throw new ServiceError(modeError, 'CONFLICT')
  return journey
}

/** Trusted in-process adapter only. Registration never establishes authority. */
export async function registerQualityJourneyCoordinatorSession(
  input: Scope & { ownerPrincipalId: string; hostKind: 'APP_SERVER_LOCAL_V1'; idempotencyKey: string },
  client: PrismaClient = prisma,
) {
  if (!input.ownerPrincipalId.trim() || !input.idempotencyKey.trim() || input.hostKind !== 'APP_SERVER_LOCAL_V1')
    throw new ServiceError('Coordinator session registration binding is invalid.', 'VALIDATION')
  return client.$transaction(async tx => {
    const journey = await readManagedSessionJourney(
      input,
      tx,
      'Coordinator registration requires explicit managed hosting.',
    )
    const requestHash = digest(input)
    const existing = await tx.qualityJourneyCoordinatorSession.findUnique({
      where: {
        journeyId_targetProjectId_registrationKey: {
          journeyId: input.journeyId,
          targetProjectId: input.targetProjectId,
          registrationKey: input.idempotencyKey,
        },
      },
    })
    if (existing) {
      if (existing.registrationRequestHash !== requestHash)
        throw new ServiceError('Coordinator registration key was reused with different input.', 'CONFLICT')
      return { replayed: true, session: existing }
    }
    const session = await tx.qualityJourneyCoordinatorSession.create({
      data: {
        id: `qjs_${randomUUID()}`,
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        ownerPrincipalId: input.ownerPrincipalId,
        hostKind: input.hostKind,
        registrationKey: input.idempotencyKey,
        registrationRequestHash: requestHash,
        provenance: 'REGISTERED_INTERNAL_V1',
      },
    })
    return { replayed: false, session }
  })
}

type ApprovedSessionRequest = Scope & {
  authority: typeof trustedHumanCoordinatorSession
  coordinatorPrincipalId: string
  requestId: string
  expectedOwnershipVersion: number
  expectedStateHash: string
  approvedBy: 'local-ui'
}
export type ActivateQualityJourneyCoordinatorSessionInput = ApprovedSessionRequest & { coordinatorSessionId: string }
export type TransferQualityJourneyCoordinatorSessionInput = ApprovedSessionRequest & {
  successorSessionId: string
  predecessorSessionId: string
  predecessorGeneration: number
  reconciliationReceiptId: string
}

type SessionTransitionInput =
  ActivateQualityJourneyCoordinatorSessionInput | TransferQualityJourneyCoordinatorSessionInput
type SessionRow = QualityJourneyCoordinatorSession

function browserStopReceiptMatchesOwner(receipt: Record<string, unknown>, browser: QualityJourneyOwnedBrowser) {
  return (
    receipt.sessionId === browser.sessionId &&
    receipt.processInstanceId === browser.processInstanceId &&
    receipt.generation === browser.generation &&
    receipt.status === 'STOP_OBSERVED'
  )
}

function browserStopReceiptMatchesScope(receipt: Record<string, unknown> | null, scope: Scope) {
  return (
    receipt?.schemaVersion === 'appraise.quality-journey-owned-browser-stop/v1' &&
    receipt.journeyId === scope.journeyId &&
    receipt.targetProjectId === scope.targetProjectId &&
    ['RUNTIME_CLOSE_CONFIRMED', 'NO_RUNTIME_LAUNCHED'].includes(receipt.observation as string)
  )
}

async function assertBrowserCleanup(scope: Scope, tx: Prisma.TransactionClient) {
  const browsers = await tx.qualityJourneyOwnedBrowser.findMany({ where: { journeyId: scope.journeyId } })
  for (const browser of browsers) {
    let valid = false
    try {
      const receipt = JSON.parse(browser.stopReceiptJson ?? 'null')
      valid =
        browser.targetProjectId === scope.targetProjectId &&
        browser.status === 'STOP_OBSERVED' &&
        browserStopReceiptMatchesScope(receipt, scope) &&
        browserStopReceiptMatchesOwner(receipt, browser) &&
        browser.stopReceiptHash === digest(receipt)
    } catch {
      /* Corrupt persisted cleanup is unresolved, never authority. */
    }
    if (!valid) throw new ServiceError('Coordinator transfer requires reconciled browser cleanup.', 'CONFLICT')
  }
}

async function assertExecutionQuiescent(scope: Scope, tx: Prisma.TransactionClient) {
  const execution = await tx.qualityJourneyExecutionCycle.findFirst({
    where: {
      journeyId: scope.journeyId,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
  })
  const nonterminalRun = await tx.qualityJourneyExecutionTestRun.count({
    where: {
      executionCycle: { journeyId: scope.journeyId },
      testRun: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    },
  })
  if (execution || nonterminalRun)
    throw new ServiceError('Coordinator transfer requires reconciled execution effects.', 'CONFLICT')
}

async function assertQuiescent(scope: Scope, tx: Prisma.TransactionClient, initial: boolean) {
  const attempts = await tx.qualityJourneyWorkAttempt.findMany({ where: { workItem: { journeyId: scope.journeyId } } })
  if (initial && attempts.length)
    throw new ServiceError('Initial activation cannot adopt prior work; explicit recovery is required.', 'CONFLICT')
  if (
    attempts.some(
      attempt =>
        !['COMPLETED', 'CANCELLED', 'REFUSED', 'FAILED', 'EXPIRED'].includes(attempt.status) ||
        (attempt.dispatchReservedAt && !attempt.spawnReceiptId),
    )
  )
    throw new ServiceError(
      'Coordinator transfer requires reconciled quiescence; active or unknown work remains.',
      'CONFLICT',
    )
  await assertBrowserCleanup(scope, tx)
  await assertExecutionQuiescent(scope, tx)
}

function assertTransitionSuccessor(
  successor: SessionRow | null,
  journey: QualityJourney,
  principalId: string,
): asserts successor is SessionRow {
  if (
    !successor ||
    successor.journeyId !== journey.id ||
    successor.targetProjectId !== journey.targetProjectId ||
    successor.ownerPrincipalId !== principalId ||
    successor.hostKind !== 'APP_SERVER_LOCAL_V1'
  )
    throw new ServiceError(
      'Coordinator session does not bind the authenticated target and principal.',
      'UNAUTHORIZED',
      403,
    )
}

function replaySessionTransition(
  successor: SessionRow,
  journey: QualityJourney,
  requestId: string,
  requestHash: string,
) {
  if (!successor.transitionRequestId) return null
  if (
    successor.transitionRequestId !== requestId ||
    successor.transitionRequestHash !== requestHash ||
    !successor.transitionResultJson
  )
    throw new ServiceError('Coordinator activation identity conflicts with a recorded transition.', 'CONFLICT')
  return {
    ...(JSON.parse(successor.transitionResultJson) as SessionTransitionResult),
    replayed: true,
    current:
      journey.currentCoordinatorSessionId === successor.id && successor.status === 'ACTIVE' && !successor.fencedAt,
  }
}

function assertTransitionSnapshot(input: SessionTransitionInput, journey: QualityJourney, successor: SessionRow) {
  if (journey.ownershipVersion !== input.expectedOwnershipVersion || journey.stateHash !== input.expectedStateHash)
    throw new ServiceError('Coordinator approval snapshot changed; obtain a fresh explicit decision.', 'CONFLICT')
  if (successor.status !== 'REGISTERED' || successor.generation !== null)
    throw new ServiceError('Coordinator successor is not a fresh registered session.', 'CONFLICT')
}

async function readTransitionPredecessor(
  input: SessionTransitionInput,
  journey: QualityJourney,
  successor: SessionRow,
  tx: Prisma.TransactionClient,
) {
  if ('successorSessionId' in input) {
    const current = await assertCurrentCoordinatorSession(
      {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        coordinatorSessionId: input.predecessorSessionId,
        coordinatorGeneration: input.predecessorGeneration,
        coordinatorPrincipalId: input.coordinatorPrincipalId,
      },
      tx,
    )
    const predecessorId = current.session!.id
    if (predecessorId === successor.id) throw new ServiceError('A transfer requires a distinct successor.', 'CONFLICT')
    return predecessorId
  }
  const prior = await tx.qualityJourneyCoordinatorSession.count({
    where: { journeyId: journey.id, generation: { not: null } },
  })
  const handoffs = await tx.qualityJourneyCoordinatorHandoff.count({ where: { journeyId: journey.id } })
  if (journey.currentCoordinatorSessionId || prior || handoffs)
    throw new ServiceError(
      'Initial activation cannot replace prior ownership; explicit transfer is required.',
      'CONFLICT',
    )
  return null
}

async function nextSessionGeneration(journeyId: string, tx: Prisma.TransactionClient) {
  const sessionMaximum = await tx.qualityJourneyCoordinatorSession.aggregate({
    where: { journeyId },
    _max: { generation: true },
  })
  const handoffMaximum = await tx.qualityJourneyCoordinatorHandoff.aggregate({
    where: { journeyId },
    _max: { generation: true },
  })
  return Math.max(sessionMaximum._max.generation ?? 0, handoffMaximum._max.generation ?? 0) + 1
}

async function commitSessionOwnership(
  input: SessionTransitionInput,
  journey: QualityJourney,
  result: SessionTransitionResult,
  tx: Prisma.TransactionClient,
) {
  const acquired = await tx.qualityJourney.updateMany({
    where: {
      id: journey.id,
      targetProjectId: journey.targetProjectId,
      hostingMode: 'APP_SERVER_LOCAL_V1',
      ownershipVersion: input.expectedOwnershipVersion,
      currentCoordinatorSessionId: result.predecessorSessionId,
      stateHash: input.expectedStateHash,
    },
    data: {
      currentCoordinatorSessionId: result.coordinatorSessionId,
      ownershipVersion: { increment: 1 },
      updatedAt: journey.updatedAt,
    },
  })
  if (acquired.count !== 1) throw new ServiceError('Coordinator ownership changed concurrently.', 'CONFLICT')
  const now = new Date()
  if (result.predecessorSessionId) {
    const fenced = await tx.qualityJourneyCoordinatorSession.updateMany({
      where: { id: result.predecessorSessionId, status: 'ACTIVE', fencedAt: null },
      data: { status: 'FENCED', fencedAt: now, fenceReason: `EXPLICIT_TRANSFER:${result.coordinatorSessionId}` },
    })
    if (fenced.count !== 1) throw new ServiceError('Coordinator predecessor changed concurrently.', 'CONFLICT')
  }
  return now
}

async function commitSessionTransition(
  input: SessionTransitionInput,
  journey: QualityJourney,
  successor: SessionRow,
  predecessorSessionId: string | null,
  request: unknown,
  requestHash: string,
  tx: Prisma.TransactionClient,
) {
  const generation = await nextSessionGeneration(journey.id, tx)
  const result: SessionTransitionResult = {
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    coordinatorSessionId: successor.id,
    coordinatorGeneration: generation,
    ownershipVersion: journey.ownershipVersion + 1,
    predecessorSessionId,
    requestId: input.requestId,
    replayed: false,
    current: true,
  }
  const now = await commitSessionOwnership(input, journey, result, tx)
  await tx.qualityJourneyCoordinatorSession.update({
    where: { id: successor.id },
    data: {
      status: 'ACTIVE',
      generation,
      predecessorSessionId,
      activatedAt: now,
      transitionRequestId: input.requestId,
      transitionRequestHash: requestHash,
      transitionRequestJson: canonicalContractJson(request),
      transitionResultJson: canonicalContractJson(result),
      provenance: 'successorSessionId' in input ? 'EXPLICIT_RECONCILED_TRANSFER_V1' : 'EXPLICIT_INITIAL_ACTIVATION_V1',
    },
  })
  return result
}

async function transitionSession(
  input: ActivateQualityJourneyCoordinatorSessionInput | TransferQualityJourneyCoordinatorSessionInput,
  client: PrismaClient,
) {
  const { authority, ...request } = input
  if (
    authority !== trustedHumanCoordinatorSession ||
    input.approvedBy !== 'local-ui' ||
    !input.coordinatorPrincipalId.trim() ||
    !input.requestId.trim()
  )
    throw new ServiceError('An authenticated trusted human session decision is required.', 'UNAUTHORIZED', 403)
  const transfer = 'successorSessionId' in input
  if (transfer && !input.reconciliationReceiptId.trim())
    throw new ServiceError('An explicit reconciled transfer decision is required.', 'VALIDATION')
  const requestHash = digest(request)
  return client
    .$transaction(async tx => {
      const journey = await readManagedSessionJourney(
        input,
        tx,
        'Managed ownership cannot adopt compatibility or unresolved hosting.',
      )
      const successorId = transfer ? input.successorSessionId : input.coordinatorSessionId
      const successor = await tx.qualityJourneyCoordinatorSession.findUnique({ where: { id: successorId } })
      assertTransitionSuccessor(successor, journey, input.coordinatorPrincipalId)
      const replay = replaySessionTransition(successor, journey, input.requestId, requestHash)
      if (replay) return replay
      assertTransitionSnapshot(input, journey, successor)
      const predecessorId = await readTransitionPredecessor(input, journey, successor, tx)
      await assertQuiescent(input, tx, !transfer)
      return commitSessionTransition(input, journey, successor, predecessorId, request, requestHash, tx)
    })
    .catch(error => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2028', 'P1008'].includes(error.code)
      )
        throw new ServiceError(
          'Coordinator ownership contention requires rereading the exact request outcome before any retry.',
          'CONFLICT',
        )
      throw error
    })
}

type SessionTransitionResult = Scope & {
  coordinatorSessionId: string
  coordinatorGeneration: number
  ownershipVersion: number
  predecessorSessionId: string | null
  requestId: string
  replayed: boolean
  current: boolean
}

export function activateQualityJourneyCoordinatorSession(
  input: ActivateQualityJourneyCoordinatorSessionInput,
  client: PrismaClient = prisma,
) {
  return transitionSession(input, client)
}
export function transferQualityJourneyCoordinatorSession(
  input: TransferQualityJourneyCoordinatorSessionInput,
  client: PrismaClient = prisma,
) {
  return transitionSession(input, client)
}
