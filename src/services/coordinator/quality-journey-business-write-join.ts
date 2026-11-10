import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import { isE2Id } from '@/lib/quality-journey/provider-grant-contract'
import { ServiceError } from '@/services/shared/errors'
import { assertCoordinatorAttemptSession } from './quality-journey-coordinator-session'
import type {
  CoordinatorSessionBinding,
  CoordinatorSessionCredentials,
} from './quality-journey-coordinator-session'
import { type E2BusinessScope, assertE2BusinessAdmission, commitE2RetirementRequest } from './quality-journey-e2-retirement-service'

export type JourneyBusinessScope = Readonly<{ journeyId: string; targetProjectId: string }>
export type TerminalPublicationKind =
  | 'ATTEMPT_TERMINAL_ROW'
  | 'WORK_ITEM_TERMINAL_ROW'
  | 'WORK_COMPLETION_PROJECTION'
  | 'ROLE_OUTPUT_FINALIZATION'
  | 'EXTERNAL_ACCEPTANCE'
export type TerminalPublication = Readonly<{
  kind: TerminalPublicationKind
  terminalAttemptId: string
  terminalResultHash: string
}>
export type BeforeJourneyBusinessWrite = (
  actualTx: Prisma.TransactionClient,
  actualScope: JourneyBusinessScope,
  publication?: TerminalPublication,
) => Promise<void>
export type AttemptTerminalInput = Readonly<{
  attemptId: string
  workItemId: string
  authorizationId: string
  resultHash: string
  terminalStatus: 'COMPLETED'
}>
export type QueueAttemptTerminal = (
  actualTx: Prisma.TransactionClient,
  actualScope: JourneyBusinessScope,
  input: AttemptTerminalInput,
) => Promise<void>

type SharedResourcePublicationOwner = {
  borrow<T>(tx: Prisma.TransactionClient, scope: E2BusinessScope,
    operation: (admitE2: () => Promise<void>) => Promise<T>): Promise<T>
}
// Only the actual live owner factory can register its exact callback identity.
const sharedResourcePublicationOwners = new WeakMap<BeforeJourneyBusinessWrite, SharedResourcePublicationOwner>()

/** Internal composition for the two typed source owners. Neither callback shape
 * nor any returned row/receipt can reconstruct the registered owner lifetime.
 */
export function withJourneySharedResourcePublicationInTransaction<T>(
  tx: Prisma.TransactionClient, scope: E2BusinessScope, beforeWrite: BeforeJourneyBusinessWrite,
  operation: (admitE2: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const owner = sharedResourcePublicationOwners.get(beforeWrite)
  if (!owner) return Promise.reject(conflict('unrecognized shared-resource owner'))
  return owner.borrow(tx, scope, operation)
}

const conflict = (reason: string) =>
  new ServiceError(`Journey business transaction requires exact admission: ${reason}.`, 'CONFLICT')

function snapshotCredentials(value: CoordinatorSessionCredentials | undefined) {
  if (!value || typeof value !== 'object') return value
  // Retain only the original authentication fields, before the first await.
  // Persisted lineage can select a fence but cannot supply these credentials.
  return Object.freeze({
    journeyId: value.journeyId,
    targetProjectId: value.targetProjectId,
    coordinatorSessionId: value.coordinatorSessionId,
    coordinatorHandoffId: value.coordinatorHandoffId,
    coordinatorGeneration: value.coordinatorGeneration,
    coordinatorPrincipalId: value.coordinatorPrincipalId,
  })
}

async function readBusinessEnrollment(
  tx: Prisma.TransactionClient,
  scope: JourneyBusinessScope,
) {
  if (!isE2Id(scope.journeyId) || !isE2Id(scope.targetProjectId)) throw conflict('invalid scope')
  const journey = await tx.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  const session = journey.currentCoordinatorSessionId
    ? await tx.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  if (!session) {
    const orphan = await tx.qualityJourneyE2Retirement.findFirst({
      where: { journeyId: scope.journeyId }, select: { id: true },
    })
    if (journey.currentCoordinatorSessionId || orphan) throw conflict('missing current session lineage')
    return { kind: 'LEGACY' as const, session: null }
  }
  if (session.journeyId !== scope.journeyId || session.targetProjectId !== scope.targetProjectId)
    throw conflict('foreign current session lineage')
  const legacy = [session.e2EnrollmentKind, session.e2EnrollmentDigest, session.e2EnrolledAt]
    .every(value => value === null)
  const orphan = legacy
    ? await tx.qualityJourneyE2Retirement.findFirst({
        where: { coordinatorSessionId: session.id }, select: { id: true },
      })
    : null
  if (legacy && !orphan) return { kind: 'LEGACY' as const, session }
  return { kind: 'E2_REQUIRES_VALIDATION' as const, session }
}

/** Internal observation only. This discriminant grants no business, source or
 * effect authority and exposes no retained session credentials or mutable row. */
export async function readJourneyBusinessEnrollmentKindInTransaction(
  tx: Prisma.TransactionClient,
  input: JourneyBusinessScope,
): Promise<'LEGACY' | 'E2_REQUIRES_VALIDATION'> {
  const scope = Object.freeze({ journeyId: input.journeyId, targetProjectId: input.targetProjectId })
  return (await readBusinessEnrollment(tx, scope)).kind
}

/**
 * Read-only conservative boundary for a mixed terminal/revoke/supersede and
 * business operation whose E2 invalidation owner has not been implemented.
 * Legacy behavior may proceed. It grants no admission and mutates no latch.
 */
export async function assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(
  tx: Prisma.TransactionClient,
  input: JourneyBusinessScope,
): Promise<void> {
  const scope = { journeyId: input.journeyId, targetProjectId: input.targetProjectId }
  const enrollment = await readBusinessEnrollment(tx, scope)
  if (enrollment.kind !== 'LEGACY') throw new ServiceError(
    'E2 mixed invalidation requires its exact owning boundary.', 'CONFLICT', 409,
    { protocol: 'M06_E2_BUSINESS_GROUP_V1', reason: 'UNSUPPORTED_E2_INVALIDATION' },
  )
}

async function admitBusinessGroup(
  tx: Prisma.TransactionClient,
  scope: JourneyBusinessScope,
  credentials: ReturnType<typeof snapshotCredentials>,
) {
  const enrollment = await readBusinessEnrollment(tx, scope)
  if (enrollment.kind === 'LEGACY') return { kind: 'LEGACY' as const }
  const { session } = enrollment
  if (!credentials || typeof credentials !== 'object' ||
    typeof credentials.coordinatorSessionId !== 'string' ||
    typeof credentials.coordinatorGeneration !== 'number' ||
    credentials.journeyId !== scope.journeyId || credentials.targetProjectId !== scope.targetProjectId ||
    credentials.coordinatorSessionId !== session.id || credentials.coordinatorGeneration !== session.generation)
    throw new ServiceError('E2 business write requires the original current coordinator binding.', 'UNAUTHORIZED')
  const binding: CoordinatorSessionBinding = { ...credentials,
    journeyId: scope.journeyId, targetProjectId: scope.targetProjectId }
  // The canonical helper validates the complete enrollment, retained policy,
  // retirement and current principal, then performs the one admission CAS.
  return assertE2BusinessAdmission(tx, {
    ...scope, coordinatorSessionId: credentials.coordinatorSessionId,
    generation: credentials.coordinatorGeneration, credentials: binding,
  })
}

type Admission = Awaited<ReturnType<typeof admitBusinessGroup>>
type TerminalPhase = 'OPEN' | 'TERMINAL_PENDING' | 'FINALIZING' | 'CLOSED' | 'FAILED'
const resultHashPattern = /^sha256:[a-f0-9]{64}$/
const publicationKinds = new Set<TerminalPublicationKind>([
  'ATTEMPT_TERMINAL_ROW', 'WORK_ITEM_TERMINAL_ROW', 'WORK_COMPLETION_PROJECTION',
  'ROLE_OUTPUT_FINALIZATION', 'EXTERNAL_ACCEPTANCE',
])
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const digestJson = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const sameTuple = (left: AttemptTerminalInput, right: AttemptTerminalInput) =>
  left.attemptId === right.attemptId && left.workItemId === right.workItemId &&
  left.authorizationId === right.authorizationId && left.resultHash === right.resultHash &&
  left.terminalStatus === right.terminalStatus

function assertTerminalInput(input: AttemptTerminalInput) {
  const boundedId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200
  if (!input || typeof input !== 'object' || Object.keys(input).length !== 5 ||
    !['attemptId', 'workItemId', 'authorizationId', 'resultHash', 'terminalStatus']
      .every(key => Object.hasOwn(input, key)) ||
    !boundedId(input.attemptId) || !boundedId(input.workItemId) || !boundedId(input.authorizationId) ||
    !resultHashPattern.test(input.resultHash) || input.terminalStatus !== 'COMPLETED')
    throw conflict('invalid terminal tuple')
}

function parsePinnedJson(raw: string | null, expectedHash: string | null, label: string): Record<string, unknown> {
  if (!raw || !expectedHash || !resultHashPattern.test(expectedHash)) throw conflict(`${label} missing`)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw conflict(`${label} JSON`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || digestJson(parsed) !== expectedHash)
    throw conflict(`${label} hash`)
  return parsed as Record<string, unknown>
}

/** This reread checks persisted ownership and result identity. The reviewed
 * completion owner still performs its mandatory mode-specific worker/principal
 * and result validation before it calls queueAttemptTerminal. */
async function assertTerminalRows(
  tx: Prisma.TransactionClient,
  scope: JourneyBusinessScope,
  tuple: AttemptTerminalInput,
  admission: Admission,
  credentials: ReturnType<typeof snapshotCredentials>,
  completed: boolean,
) {
  // The existing completion owner retains legacy validation. This E2 join
  // must not add a new persistence prerequisite to an all-null generation.
  if (admission.kind === 'LEGACY') return
  const original = credentials && typeof credentials === 'object' ? credentials : null
  if (!original ||
    original.journeyId !== scope.journeyId || original.targetProjectId !== scope.targetProjectId ||
    !isE2Id(tuple.attemptId) || !isE2Id(tuple.workItemId) || !isE2Id(tuple.authorizationId) ||
    !isE2Id(original.coordinatorSessionId) ||
    typeof original.coordinatorGeneration !== 'number') throw conflict('original terminal credentials')
  await assertCoordinatorAttemptSession({ ...original, ...scope, attemptId: tuple.attemptId }, tx)
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({
    where: { id: tuple.attemptId }, include: { workItem: true, sessionBinding: true },
  })
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({
    where: { id: tuple.authorizationId },
  })
  if (!attempt || !authorization || attempt.workItemId !== tuple.workItemId ||
    attempt.authorizationId !== tuple.authorizationId || attempt.workItem.id !== tuple.workItemId ||
    attempt.workItem.journeyId !== scope.journeyId || attempt.workItem.targetProjectId !== scope.targetProjectId ||
    authorization.journeyId !== scope.journeyId || authorization.targetProjectId !== scope.targetProjectId ||
    authorization.workItemId !== tuple.workItemId || authorization.role !== attempt.workItem.role ||
    authorization.roleContractDigest !== attempt.workItem.roleContractDigest ||
    authorization.revokedAt || authorization.cancelledAt ||
    !isE2Id(attempt.leaseId) || !validDate(attempt.leaseExpiresAt) ||
    !Number.isSafeInteger(attempt.assignmentGeneration) || attempt.assignmentGeneration < 1 ||
    attempt.workItem.currentAttempt !== attempt.attempt) throw conflict('terminal work lineage')
  if (completed) {
    if (attempt.status !== 'COMPLETED' || attempt.workItem.status !== 'COMPLETED' ||
      attempt.resultHash !== tuple.resultHash || !validDate(attempt.completedAt))
      throw conflict('terminal completion state')
    parsePinnedJson(attempt.resultJson, tuple.resultHash, 'terminal result')
  } else if (attempt.status !== 'IN_PROGRESS' || attempt.workItem.status !== 'IN_PROGRESS' ||
    attempt.resultHash !== null || attempt.resultJson !== null || attempt.completedAt !== null)
    throw conflict('terminal attempt already changed')
  const binding = attempt.sessionBinding
  if (!original || !binding || binding.sessionId !== original.coordinatorSessionId ||
    binding.coordinatorGeneration !== original.coordinatorGeneration ||
    binding.journeyId !== scope.journeyId || binding.targetProjectId !== scope.targetProjectId ||
    binding.workItemId !== tuple.workItemId || binding.authorizationId !== tuple.authorizationId ||
    binding.leaseId !== attempt.leaseId || binding.role !== attempt.workItem.role ||
    binding.inputHash !== attempt.workItem.inputHash ||
    binding.assignmentId !== attempt.assignmentId ||
    binding.assignmentGeneration !== attempt.assignmentGeneration)
    throw conflict('terminal session binding')
  const assignment = parsePinnedJson(attempt.assignmentJson, attempt.assignmentHash, 'terminal assignment')
  parsePinnedJson(authorization.authorizationJson, authorization.authorizationHash, 'terminal authorization')
  const lease = assignment.lease as Record<string, unknown> | undefined
  if (assignment.assignmentId !== attempt.assignmentId || assignment.journeyId !== scope.journeyId ||
    assignment.targetProjectId !== scope.targetProjectId || assignment.workItemId !== tuple.workItemId ||
    assignment.inputHash !== attempt.workItem.inputHash || lease?.leaseId !== attempt.leaseId)
    throw conflict('terminal assignment identity')
  if (attempt.executionMode === 'EXTERNAL_V1') {
    const receipt = parsePinnedJson(attempt.externalAdmissionJson, attempt.externalAdmissionHash, 'external admission')
    if (!isE2Id(attempt.externalAdmissionId) ||
      typeof attempt.externalPrincipalId !== 'string' || !attempt.externalPrincipalId ||
      !attempt.externalPrincipalAssurance || authorization.externalAdmissionProtocol !== 'EXTERNAL_V1' ||
      authorization.externalPrincipalId !== attempt.externalPrincipalId ||
      authorization.externalPrincipalAssurance !== attempt.externalPrincipalAssurance ||
      receipt.protocol !== 'EXTERNAL_V1' || receipt.assignmentId !== attempt.assignmentId ||
      receipt.assignmentGeneration !== attempt.assignmentGeneration ||
      receipt.attemptId !== tuple.attemptId || receipt.workItemId !== tuple.workItemId ||
      receipt.inputHash !== attempt.workItem.inputHash || receipt.leaseId !== attempt.leaseId)
      throw conflict('external terminal receipt lineage')
  } else if (attempt.executionMode === 'MANAGED') {
    const request = parsePinnedJson(attempt.spawnRequestJson, attempt.spawnRequestHash, 'worker request')
    parsePinnedJson(attempt.spawnReceiptJson, attempt.spawnReceiptHash, 'worker receipt')
    if (request.assignmentId !== attempt.assignmentId || request.requestId !== attempt.spawnRequestId)
      throw conflict('managed terminal receipt lineage')
  } else throw conflict('unsupported terminal execution mode')
}

export function terminalRetirementRequestId(
  scope: JourneyBusinessScope,
  coordinatorSessionId: string,
  generation: number,
  tuple: AttemptTerminalInput,
) {
  const identity = canonicalContractJson({ protocol: 'M06_E2_ATTEMPT_TERMINAL_V1',
    journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
    coordinatorSessionId, generation, attemptId: tuple.attemptId, workItemId: tuple.workItemId,
    authorizationId: tuple.authorizationId, terminalStatus: tuple.terminalStatus, resultHash: tuple.resultHash })
  return `e2_attempt_terminal_${createHash('sha256').update(identity).digest('hex')}`
}

/**
 * One borrowing owner. Terminal publication is a finite last phase of this
 * same SQL transaction; the owner cannot call a retirement finalizer directly.
 */
export async function withJourneyBusinessWriteJoinInTransaction<T>(
  tx: Prisma.TransactionClient,
  input: JourneyBusinessScope,
  originalCredentials: CoordinatorSessionCredentials | undefined,
  body: (beforeWrite: BeforeJourneyBusinessWrite, queueAttemptTerminal: QueueAttemptTerminal) => Promise<T>,
): Promise<T> {
  const scope = Object.freeze({ journeyId: input.journeyId, targetProjectId: input.targetProjectId })
  if (!isE2Id(scope.journeyId) || !isE2Id(scope.targetProjectId)) throw conflict('invalid scope')
  const credentials = snapshotCredentials(originalCredentials)
  let phase: TerminalPhase = 'OPEN'
  let failed = false
  let failure: unknown
  let admission: Promise<Admission> | undefined
  let terminalTuple: AttemptTerminalInput | undefined
  let queued: Readonly<{ tuple: AttemptTerminalInput; admission: Admission }> | undefined
  let queuePromise: Promise<void> | undefined
  const active = new Set<Promise<unknown>>()
  const poison = (error: unknown) => {
    if (!failed) { failed = true; failure = error }
    phase = 'FAILED'
  }
  const assertScope = (actualTx: Prisma.TransactionClient, actualScope: JourneyBusinessScope) => {
    if (actualTx !== tx || actualScope?.journeyId !== scope.journeyId ||
      actualScope.targetProjectId !== scope.targetProjectId) throw conflict('foreign transaction or scope')
  }
  const ensureAdmission = () => {
    if (!admission) admission = admitBusinessGroup(tx, scope, credentials)
    return admission
  }
  const tracked = <T>(effect: () => Promise<T>): Promise<T> => {
    const invocation = Promise.resolve().then(effect)
    active.add(invocation)
    void invocation.then(
      () => { active.delete(invocation) },
      error => { active.delete(invocation); poison(error) },
    )
    return invocation
  }
  const beforeWrite: BeforeJourneyBusinessWrite = (actualTx, actualScope, publication) => {
    let pinned: TerminalPublication | undefined
    try { pinned = publication && Object.freeze({ ...publication }) }
    catch (error) { return tracked(async () => { poison(error); throw error }) }
    return tracked(async () => {
      try {
        assertScope(actualTx, actualScope)
        if (phase !== 'OPEN' && phase !== 'TERMINAL_PENDING') throw conflict('closed business group')
        if (failed) throw failure
        await ensureAdmission()
        if (phase !== 'OPEN' && phase !== 'TERMINAL_PENDING') throw conflict('closed business group')
        if (failed) throw failure
        if (terminalTuple) {
          if (queuePromise) await queuePromise
          if (phase !== 'TERMINAL_PENDING' || !queued || !pinned ||
            Object.keys(pinned).length !== 3 ||
            !publicationKinds.has(pinned.kind) ||
            pinned.terminalAttemptId !== queued.tuple.attemptId ||
            pinned.terminalResultHash !== queued.tuple.resultHash)
            throw conflict('unsupported terminal publication')
          return
        }
        if (phase !== 'OPEN' || pinned) throw conflict('unsupported ordinary publication')
        // The admission promise is the only ordinary E2 CAS for this group.
      } catch (error) { poison(error); throw error }
    })
  }
  const queueAttemptTerminal: QueueAttemptTerminal = (actualTx, actualScope, inputTuple) => {
    let tuple: AttemptTerminalInput
    try { tuple = Object.freeze({ ...inputTuple }) as AttemptTerminalInput }
    catch (error) { return tracked(async () => { poison(error); throw error }) }
    if (terminalTuple && sameTuple(terminalTuple, tuple) && queuePromise) {
      return tracked(async () => {
        try {
          assertScope(actualTx, actualScope)
          if (phase !== 'OPEN' && phase !== 'TERMINAL_PENDING') throw conflict('closed terminal group')
          if (failed) throw failure
          await queuePromise
        }
        catch (error) { poison(error); throw error }
      })
    }
    // Reserve before the first await: two calls in one synchronous turn must
    // see the same tuple, rather than racing to become two distinct owners.
    const alreadyReserved = terminalTuple !== undefined
    if (!alreadyReserved) terminalTuple = tuple
    const invocation = tracked(async () => {
      try {
        assertScope(actualTx, actualScope)
        if (phase !== 'OPEN') throw conflict('closed terminal group')
        if (failed) throw failure
        if (alreadyReserved || terminalTuple !== tuple)
          throw conflict('second terminal attempt')
        assertTerminalInput(tuple)
        const admitted = await ensureAdmission()
        if (phase !== 'OPEN') throw conflict('closed terminal group')
        if (failed) throw failure
        await assertTerminalRows(tx, scope, tuple, admitted, credentials, false)
        if (phase !== 'OPEN' || failed) throw conflict('terminal queue closed')
        queued = Object.freeze({ tuple, admission: admitted })
        phase = 'TERMINAL_PENDING'
      } catch (error) { poison(error); throw error }
    })
    queuePromise = invocation
    return invocation
  }
  const liveSharedChildren = new Set<{ close(): void }>()
  const assertSharedOwnerOpen = () => {
    if (phase !== 'OPEN' || terminalTuple || failed) throw conflict('shared-resource owner is not open')
  }
  sharedResourcePublicationOwners.set(beforeWrite, {
    borrow<T>(actualTx: Prisma.TransactionClient, suppliedScope: E2BusinessScope,
      operation: (admitE2: () => Promise<void>) => Promise<T>): Promise<T> {
      let pinned: E2BusinessScope
      try {
        // Capture happens inside the recognized owner: throwing getters/invalid
        // inputs poison it even if the caller catches the returned rejection.
        const supplied = suppliedScope.credentials
        const original = snapshotCredentials(supplied)
        const journeyId = suppliedScope.journeyId, targetProjectId = suppliedScope.targetProjectId
        const coordinatorSessionId = suppliedScope.coordinatorSessionId, generation = suppliedScope.generation
        if (!original || typeof original !== 'object' ||
          typeof original.journeyId !== 'string' || typeof original.targetProjectId !== 'string' ||
          original.journeyId !== journeyId || original.targetProjectId !== targetProjectId ||
          original.coordinatorSessionId !== coordinatorSessionId || original.coordinatorGeneration !== generation)
          throw conflict('shared-resource original binding mismatch')
        pinned = { journeyId, targetProjectId, coordinatorSessionId, generation,
          credentials: { ...original, journeyId: original.journeyId, targetProjectId: original.targetProjectId } }
        assertScope(actualTx, pinned)
        assertSharedOwnerOpen()
        if (liveSharedChildren.size) throw conflict('reentrant shared-resource child')
        if (!credentials || typeof credentials !== 'object' ||
          !isE2Id(coordinatorSessionId) || !Number.isSafeInteger(generation) || generation < 1 || generation > 2_147_483_647 ||
          coordinatorSessionId !== credentials.coordinatorSessionId || generation !== credentials.coordinatorGeneration ||
          original.journeyId !== credentials.journeyId || original.targetProjectId !== credentials.targetProjectId ||
          original.coordinatorSessionId !== credentials.coordinatorSessionId ||
          original.coordinatorGeneration !== credentials.coordinatorGeneration ||
          original.coordinatorHandoffId !== credentials.coordinatorHandoffId ||
          original.coordinatorPrincipalId !== credentials.coordinatorPrincipalId ||
          typeof operation !== 'function') throw conflict('shared-resource original binding mismatch')
      } catch (error) {
        poison(error)
        return tracked(async () => { throw error })
      }
      let open = true
      const pending = new Set<Promise<void>>()
      const child = { close: () => { open = false } }
      liveSharedChildren.add(child)
      const assertLive = () => {
        assertSharedOwnerOpen()
        if (!open) throw conflict('shared-resource child is closed')
      }
      const admitE2 = (): Promise<void> => {
        const invocation = tracked(async () => {
          try {
            assertLive()
            const admitted = await ensureAdmission()
            assertLive()
            if (admitted.kind !== 'E2_V1') throw conflict('shared-resource publication requires E2')
          } catch (error) { poison(error); throw error }
        })
        pending.add(invocation)
        void invocation.then(() => { pending.delete(invocation) }, () => { pending.delete(invocation) })
        return invocation
      }
      return tracked(async () => {
        try {
          assertLive()
          const result = await operation(admitE2)
          // Close synchronously at settlement; a floated admission must finish
          // rejecting/draining before this child can let the owner settle.
          child.close()
          if (pending.size) {
            poison(conflict('shared-resource child returned before admission settled'))
            await Promise.allSettled([...pending])
          }
          assertSharedOwnerOpen()
          if (failed) throw failure
          return result
        } catch (error) { poison(error); throw error }
        finally {
          child.close()
          if (pending.size) await Promise.allSettled([...pending])
          liveSharedChildren.delete(child)
        }
      })
    },
  })
  const settleChildren = async () => {
    // A child deliberately floated into the next microtask must not let this
    // transaction return a successful body before its outcome is known.
    await Promise.resolve()
    if (active.size) {
      poison(conflict('business group returned before admission completed or terminal callbacks settled'))
      await Promise.allSettled([...active])
    }
    await Promise.resolve()
    if (failed) throw failure
  }
  try {
    const result = await body(beforeWrite, queueAttemptTerminal)
    phase = 'FINALIZING'
    await settleChildren()
    if (terminalTuple) {
      if (!queued || !admission) throw conflict('terminal queue did not settle')
      await assertTerminalRows(tx, scope, queued.tuple, queued.admission, credentials, true)
      if (queued.admission.kind === 'E2_V1') {
        if (!credentials || typeof credentials !== 'object' ||
          !isE2Id(credentials.coordinatorSessionId) ||
          typeof credentials.coordinatorGeneration !== 'number') throw conflict('terminal retirement credentials')
        const binding: CoordinatorSessionBinding = { ...credentials, ...scope }
        const requestId = terminalRetirementRequestId(
          scope, credentials.coordinatorSessionId, credentials.coordinatorGeneration, queued.tuple,
        )
        // This is the one owner sample for the retirement request, after all
        // business sidecars and immediately before the canonical invalidator.
        const requestedAt = new Date()
        const retirement = await commitE2RetirementRequest(tx, {
          ...scope, coordinatorSessionId: credentials.coordinatorSessionId,
          generation: credentials.coordinatorGeneration, requestId, requestedAt,
          authority: { kind: 'CURRENT_SESSION', credentials: binding },
        }, 'ATTEMPT_TERMINAL')
        if (retirement.status !== 'RETIRE_REQUESTED') throw conflict('terminal retirement was not newly requested')
      }
    }
    if (failed) throw failure
    phase = 'CLOSED'
    return result
  } catch (error) {
    poison(error)
    if (active.size) await Promise.allSettled([...active])
    if (admission) { try { await admission } catch (admissionError) { poison(admissionError) } }
    throw failure
  } finally {
    sharedResourcePublicationOwners.delete(beforeWrite)
    for (const child of liveSharedChildren) child.close()
    if (phase !== 'CLOSED') phase = 'FAILED'
  }
}
