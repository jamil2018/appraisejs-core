import type {
  Prisma,
  PrismaClient,
  QualityJourney,
  QualityJourneyCoordinatorSession,
  QualityJourneyWorkAttemptSessionBinding,
} from '@prisma/client'

import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

/** Identity-only in-process capability. JSON/model input cannot construct it. */
export const trustedHumanCoordinatorSession: unique symbol = Symbol('trusted human Journey decision')
export type CoordinatorWorkerSessionCredentials = {
  journeyId?: string
  targetProjectId?: string
  coordinatorSessionId?: string
  coordinatorHandoffId?: string
  coordinatorGeneration?: number
  /** Set by trusted project authentication, never by the model payload. */
  coordinatorPrincipalId?: string
}
export type CoordinatorSessionCredentials = CoordinatorWorkerSessionCredentials | typeof trustedHumanCoordinatorSession
export type CoordinatorSessionBinding = CoordinatorWorkerSessionCredentials & {
  journeyId: string
  targetProjectId: string
}
type Scope = Pick<CoordinatorSessionBinding, 'journeyId' | 'targetProjectId'> & { attemptId?: string }

const compatibleNoSessionProvenance = new Set([
  'CREATED_COMPATIBILITY_V1',
  'M03_SQL_V1:EMPTY_NO_SESSION',
  'M03_SQL_V1:BOUNDED_NO_SESSION_LINEAGE',
])
const unauthorized = () =>
  new ServiceError('Coordinator session generation is not current for this Journey and target.', 'UNAUTHORIZED', 403)

type SessionRow = QualityJourneyCoordinatorSession
type AttemptWithWork = Prisma.QualityJourneyWorkAttemptGetPayload<{ include: { workItem: true } }>

function assertLegacyNoSession(input: CoordinatorSessionBinding, journey: QualityJourney) {
  if (journey.hostingMode !== 'EXTERNAL_LEGACY' || !compatibleNoSessionProvenance.has(journey.hostingProvenance))
    throw unauthorized()
  // A supplied session must never be interpreted as the no-session branch.
  if (input.coordinatorSessionId || input.coordinatorHandoffId || input.coordinatorGeneration !== undefined)
    throw unauthorized()
}

function assertActiveSessionScope(
  session: SessionRow | null,
  journey: QualityJourney,
  generation: number | undefined,
): asserts session is SessionRow {
  if (!session || session.journeyId !== journey.id || session.targetProjectId !== journey.targetProjectId)
    throw unauthorized()
  if (
    session.status !== 'ACTIVE' ||
    session.fencedAt ||
    session.generation !== generation ||
    session.hostKind !== journey.hostingMode
  )
    throw unauthorized()
}

function assertLegacyCredentialAliases(input: CoordinatorSessionBinding, session: SessionRow) {
  if (
    (input.coordinatorSessionId && input.coordinatorSessionId !== session.id) ||
    (input.coordinatorHandoffId && input.coordinatorHandoffId !== session.legacyHandoffId) ||
    (!input.coordinatorSessionId && !input.coordinatorHandoffId)
  )
    throw unauthorized()
}

function assertSessionCredentialAliases(input: CoordinatorSessionBinding, session: SessionRow, managed: boolean) {
  if (!managed) return assertLegacyCredentialAliases(input, session)
  if (
    input.coordinatorHandoffId ||
    input.coordinatorSessionId !== session.id ||
    input.coordinatorPrincipalId !== session.ownerPrincipalId
  )
    throw unauthorized()
}

async function assertMappedLegacyHandoff(session: SessionRow, journey: QualityJourney, client: Db) {
  if (!session.legacyHandoffId) return
  const handoff = await client.qualityJourneyCoordinatorHandoff.findUnique({ where: { id: session.legacyHandoffId } })
  if (
    !handoff ||
    !handoff.takeoverAt ||
    handoff.status !== 'CONNECTED' ||
    handoff.fencedAt ||
    handoff.generation !== session.generation ||
    handoff.journeyId !== journey.id ||
    handoff.targetProjectId !== journey.targetProjectId
  )
    throw unauthorized()
}

function assertScopedAttempt(
  attempt: AttemptWithWork | null,
  journey: QualityJourney,
): asserts attempt is AttemptWithWork {
  if (
    !attempt ||
    attempt.workItem.journeyId !== journey.id ||
    attempt.workItem.targetProjectId !== journey.targetProjectId
  )
    throw unauthorized()
}

/** Pure authority check, also suitable for read-only ingress prechecks. */
export async function assertCurrentCoordinatorSession(input: CoordinatorSessionBinding, client: Db) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  if (!['EXTERNAL_LEGACY', 'APP_SERVER_LOCAL_V1'].includes(journey.hostingMode))
    throw new ServiceError('Quality Journey ownership requires explicit recovery.', 'CONFLICT')
  if (!journey.currentCoordinatorSessionId) {
    assertLegacyNoSession(input, journey)
    return { journey, session: null }
  }
  const session = await client.qualityJourneyCoordinatorSession.findUnique({
    where: { id: journey.currentCoordinatorSessionId },
  })
  assertActiveSessionScope(session, journey, input.coordinatorGeneration)
  assertSessionCredentialAliases(input, session, journey.hostingMode === 'APP_SERVER_LOCAL_V1')
  if (journey.hostingMode === 'EXTERNAL_LEGACY') await assertMappedLegacyHandoff(session, journey, client)
  return { journey, session }
}

/** New work is bound in the same transaction as its claim, never by payload rewrite. */
export async function bindCoordinatorAttemptSession(
  input: CoordinatorSessionBinding & { attemptId: string },
  client: Db,
) {
  const { journey, session } = await assertCurrentCoordinatorSession(input, client)
  const attempt = await client.qualityJourneyWorkAttempt.findUnique({
    where: { id: input.attemptId },
    include: { workItem: true },
  })
  assertScopedAttempt(attempt, journey)
  return client.qualityJourneyWorkAttemptSessionBinding.create({
    data: {
      attemptId: attempt.id,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      sessionId: session?.id,
      coordinatorGeneration: session?.generation,
      assignmentGeneration: attempt.assignmentGeneration,
      workItemId: attempt.workItemId,
      role: attempt.workItem.role,
      authorizationId: attempt.authorizationId,
      leaseId: attempt.leaseId,
      inputHash: attempt.workItem.inputHash,
      assignmentId: attempt.assignmentId,
      provenance: session ? 'CLAIM_SESSION_V1' : 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1',
    },
  })
}

function assertAttemptAssignmentLineage(
  binding: QualityJourneyWorkAttemptSessionBinding | null,
  attempt: AttemptWithWork,
) {
  if (
    binding &&
    (binding.inputHash !== attempt.workItem.inputHash ||
      binding.assignmentId !== attempt.assignmentId ||
      binding.assignmentGeneration !== attempt.assignmentGeneration)
  )
    throw new ServiceError('Quality Journey attempt assignment lineage changed.', 'CONFLICT')
}

function assertBindingJourneyScope(
  binding: QualityJourneyWorkAttemptSessionBinding | null,
  journey: QualityJourney,
): asserts binding is QualityJourneyWorkAttemptSessionBinding {
  if (!binding || binding.journeyId !== journey.id || binding.targetProjectId !== journey.targetProjectId)
    throw unauthorized()
}

function assertBindingSession(binding: QualityJourneyWorkAttemptSessionBinding, session: SessionRow | null) {
  if (binding.sessionId !== (session?.id ?? null) || binding.coordinatorGeneration !== (session?.generation ?? null))
    throw unauthorized()
}

function assertBindingWorkAuthority(binding: QualityJourneyWorkAttemptSessionBinding, attempt: AttemptWithWork) {
  if (
    binding.workItemId !== attempt.workItemId ||
    binding.role !== attempt.workItem.role ||
    binding.authorizationId !== attempt.authorizationId ||
    binding.leaseId !== attempt.leaseId
  )
    throw unauthorized()
}

/** Recheck immutable ownership on subsequent canonical worker writes. */
export async function assertCoordinatorAttemptSession(
  input: CoordinatorSessionBinding & { attemptId: string },
  client: Db,
) {
  const { journey, session } = await assertCurrentCoordinatorSession(input, client)
  const attempt = await client.qualityJourneyWorkAttempt.findUnique({
    where: { id: input.attemptId },
    include: { workItem: true, sessionBinding: true },
  })
  assertScopedAttempt(attempt, journey)
  const binding = attempt.sessionBinding
  // Legacy records without a provable association are not adopted into managed
  // ownership; their established compatibility path is retained in place.
  if (journey.hostingMode === 'EXTERNAL_LEGACY' && (!binding || binding.provenance.startsWith('M03_SQL_V1:'))) return
  assertAttemptAssignmentLineage(binding, attempt)
  assertBindingJourneyScope(binding, journey)
  assertBindingSession(binding, session)
  assertBindingWorkAuthority(binding, attempt)
}

/** The write fence contends with activation/transfer on the same ownership CAS. */
export async function assertCoordinatorRecoverySession(
  session: CoordinatorSessionCredentials | undefined,
  scope: Scope,
  client: Db,
) {
  let journey
  if (session === trustedHumanCoordinatorSession) {
    journey = await client.qualityJourney.findFirst({
      where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    })
    if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  } else {
    const current = await assertCurrentCoordinatorSession({ ...session, ...scope }, client)
    journey = current.journey
    if (scope.attemptId)
      await assertCoordinatorAttemptSession({ ...session, ...scope, attemptId: scope.attemptId }, client)
  }
  const fenced = await client.qualityJourney.updateMany({
    where: {
      id: journey.id,
      targetProjectId: journey.targetProjectId,
      ownershipVersion: journey.ownershipVersion,
      currentCoordinatorSessionId: journey.currentCoordinatorSessionId,
    },
    data: { ownershipVersion: { increment: 1 }, updatedAt: journey.updatedAt },
  })
  if (fenced.count !== 1) throw new ServiceError('Quality Journey ownership changed concurrently.', 'CONFLICT')
}

export async function assertCoordinatorMutationSession(
  session: CoordinatorSessionCredentials | undefined,
  scope: Scope,
  client: Db,
) {
  await assertCoordinatorRecoverySession(session, scope, client)
  const journey = await client.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    select: { status: true, hostingMode: true },
  })
  if (journey && !['EXTERNAL_LEGACY', 'APP_SERVER_LOCAL_V1'].includes(journey.hostingMode))
    throw new ServiceError('Quality Journey ownership requires explicit recovery.', 'CONFLICT')
  if (journey?.status === 'PAUSED')
    throw new ServiceError('Quality Journey is paused. Reconcile owned work before resuming.', 'CONFLICT')
}
