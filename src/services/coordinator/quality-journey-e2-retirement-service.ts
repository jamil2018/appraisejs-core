import type { Prisma, QualityJourney, QualityJourneyCoordinatorSession } from '@prisma/client'

import { isE2Digest, isE2Id, isE2Uint } from '@/lib/quality-journey/provider-grant-contract'
import { validateE2CampaignPolicyRow } from '@/lib/quality-journey/e2-campaign-policy-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  assertCurrentCoordinatorSession,
  trustedHumanCoordinatorSession,
  type CoordinatorSessionBinding,
} from './quality-journey-coordinator-session'

/** Transaction-local E2 fence. Call before the protected write in the same owning transaction. */
export type E2BusinessScope = Readonly<{
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
  credentials: CoordinatorSessionBinding
}>
export type E2RetirementReason =
  | 'PAUSE' | 'REVOKE' | 'CANCEL' | 'SUPERSEDE' | 'LEASE_EXPIRED'
  | 'RUN_RETENTION_EXPIRED' | 'INTENT_DEADLINE_EXPIRED' | 'ATTEMPT_TERMINAL'
  | 'RUN_TERMINAL' | 'TRANSFER_REQUESTED' | 'SOURCE_FAILURE'
export type E2RetirementScope = Readonly<{
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
  requestId: string
  /** Caller-supplied canonical parent sample; this helper never takes a second clock sample. */
  requestedAt: Date
  authority:
    | Readonly<{ kind: 'CURRENT_SESSION'; credentials: CoordinatorSessionBinding }>
    | Readonly<{ kind: 'LOCAL_PROJECT_AUTHENTICATED'; capability: typeof trustedHumanCoordinatorSession }>
}>

type E2Journey = QualityJourney & { e2AdmissionVersion: number }
type E2Session = QualityJourneyCoordinatorSession & {
  e2EnrollmentKind: string | null
  e2EnrollmentDigest: string | null
  e2EnrolledAt: Date | null
}
type RetirementRow = {
  id: string
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
  state: string
  requestId: string | null
  requestedAt: Date | null
  requestReason: string | null
  effectiveAt: Date | null
  effectiveEvidenceDigest: string | null
  version: number
  campaignPolicyId: string | null
}
type E2TxView = {
  qualityJourney: {
    findFirst(args: { where: { id: string; targetProjectId: string } }): Promise<E2Journey | null>
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  }
  qualityJourneyCoordinatorSession: {
    findUnique(args: { where: { id: string } }): Promise<E2Session | null>
  }
  qualityJourneyE2Retirement: {
    findMany(args: { where: Record<string, unknown>; take: number }): Promise<RetirementRow[]>
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  }
  qualityJourneyE2CampaignPolicy: {
    findUnique(args: { where: { id: string } }): Promise<unknown>
  }
}

const reasons: readonly E2RetirementReason[] = [
  'PAUSE', 'REVOKE', 'CANCEL', 'SUPERSEDE', 'LEASE_EXPIRED', 'RUN_RETENTION_EXPIRED',
  'INTENT_DEADLINE_EXPIRED', 'ATTEMPT_TERMINAL', 'RUN_TERMINAL', 'TRANSFER_REQUESTED', 'SOURCE_FAILURE',
]
const lastIncrementable = 2_147_483_645
const conflict: (detail: string) => never = detail => {
  throw new ServiceError(`E2 generation requires exact recovery: ${detail}.`, 'CONFLICT')
}
const unauthorized: () => never = () => {
  throw new ServiceError('E2 retirement lineage is not authenticated for this Journey.', 'UNAUTHORIZED', 403)
}
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const validScope = (scope: { journeyId: string; targetProjectId: string;
  coordinatorSessionId: string; generation: number }) =>
  isE2Id(scope.journeyId) && isE2Id(scope.targetProjectId) && isE2Id(scope.coordinatorSessionId) &&
  isE2Uint(scope.generation) && scope.generation > 0

function assertExactCredentials(scope: E2BusinessScope | E2RetirementScope,
  credentials: CoordinatorSessionBinding) {
  if (credentials.journeyId !== scope.journeyId || credentials.targetProjectId !== scope.targetProjectId ||
    credentials.coordinatorSessionId !== scope.coordinatorSessionId ||
    credentials.coordinatorGeneration !== scope.generation) unauthorized()
}

async function readCurrentLineage(tx: Prisma.TransactionClient, scope: E2BusinessScope | E2RetirementScope,
  authority: E2RetirementScope['authority'] | Readonly<{ kind: 'CURRENT_SESSION'; credentials: CoordinatorSessionBinding }>) {
  if (!validScope(scope)) unauthorized()
  if (authority.kind === 'CURRENT_SESSION') {
    assertExactCredentials(scope, authority.credentials)
    const current = await assertCurrentCoordinatorSession(authority.credentials, tx)
    if (!current.session || current.session.id !== scope.coordinatorSessionId ||
      current.session.generation !== scope.generation) unauthorized()
    return { journey: current.journey as E2Journey, session: current.session as E2Session }
  }
  if (authority.kind !== 'LOCAL_PROJECT_AUTHENTICATED' ||
    authority.capability !== trustedHumanCoordinatorSession) unauthorized()
  const view = tx as unknown as E2TxView
  const journey = await view.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
  })
  if (!journey || journey.currentCoordinatorSessionId !== scope.coordinatorSessionId ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1') unauthorized()
  const session = await view.qualityJourneyCoordinatorSession.findUnique({
    where: { id: scope.coordinatorSessionId },
  })
  if (!session || session.journeyId !== journey.id || session.targetProjectId !== journey.targetProjectId ||
    session.generation !== scope.generation || session.status !== 'ACTIVE' || session.fencedAt ||
    session.hostKind !== journey.hostingMode) unauthorized()
  return { journey, session }
}

function enrollmentState(session: E2Session): 'LEGACY' | 'E2_V1' {
  const fields = [session.e2EnrollmentKind, session.e2EnrollmentDigest, session.e2EnrolledAt]
  if (fields.every(value => value === null)) return 'LEGACY'
  if (session.e2EnrollmentKind !== 'E2_V1' || !isE2Digest(session.e2EnrollmentDigest) ||
    !validDate(session.e2EnrolledAt) || !isE2Uint(session.generation) || !session.generation)
    return conflict('session enrollment')
  return 'E2_V1'
}

function assertRow(row: RetirementRow, scope: E2BusinessScope | E2RetirementScope) {
  if (row.journeyId !== scope.journeyId || row.targetProjectId !== scope.targetProjectId ||
    row.coordinatorSessionId !== scope.coordinatorSessionId || row.generation !== scope.generation ||
    !isE2Id(row.id) || !isE2Id(row.campaignPolicyId) ||
    !isE2Uint(row.version, 2_147_483_646)) conflict('retirement scope or campaign binding')
  if (row.state === 'ACTIVE') {
    if (row.requestId !== null || row.requestedAt !== null || row.requestReason !== null ||
      row.effectiveAt !== null || row.effectiveEvidenceDigest !== null) conflict('active retirement row')
  } else if (row.state === 'RETIRE_REQUESTED' || row.state === 'RETIRE_EFFECTIVE') {
    if (!isE2Id(row.requestId) || !validDate(row.requestedAt) ||
      !reasons.includes(row.requestReason as E2RetirementReason)) conflict('request receipt')
    if (row.state === 'RETIRE_REQUESTED' &&
      (row.effectiveAt !== null || row.effectiveEvidenceDigest !== null)) conflict('request effectiveness')
    if (row.state === 'RETIRE_EFFECTIVE' &&
      (!validDate(row.effectiveAt) || !isE2Digest(row.effectiveEvidenceDigest))) conflict('effective receipt')
  } else conflict('retirement state')
}

async function readEnrollmentRow(tx: Prisma.TransactionClient,
  scope: E2BusinessScope | E2RetirementScope, session: E2Session) {
  const view = tx as unknown as E2TxView
  const enrollment = enrollmentState(session)
  const rows = await view.qualityJourneyE2Retirement.findMany({
    where: { coordinatorSessionId: session.id }, take: 2,
  })
  if (enrollment === 'LEGACY') {
    if (rows.length) conflict('orphan retirement row for all-null enrollment')
    return { kind: 'LEGACY' as const }
  }
  if (rows.length !== 1) conflict('missing or duplicate retirement row')
  const row = rows[0]
  if (!row) conflict('missing retirement row')
  assertRow(row, scope)
  let policy
  try {
    policy = validateE2CampaignPolicyRow(await view.qualityJourneyE2CampaignPolicy.findUnique({
      where: { id: row.campaignPolicyId! },
    }))
  } catch { return conflict('campaign policy missing or corrupt') }
  if (policy.id !== row.campaignPolicyId || policy.journeyId !== scope.journeyId ||
    policy.targetProjectId !== scope.targetProjectId || policy.sourceTupleDigest !== session.e2EnrollmentDigest)
    conflict('campaign policy lineage')
  // Authenticated business/invalidation reads retained lineage. Private original
  // source/allocation pins remain exclusively in producer activation/grant paths.
  return { kind: 'E2_V1' as const, row, policy }
}

function assertJourneyVersion(journey: E2Journey) {
  if (!isE2Uint(journey.e2AdmissionVersion, lastIncrementable) ||
    !isE2Uint(journey.ownershipVersion)) conflict('admission version')
}

/** Legacy/all-null enrollment retains its existing guard; E2 contends before a protected business write. */
export async function assertE2BusinessAdmission(tx: Prisma.TransactionClient, scope: E2BusinessScope) {
  const { journey, session } = await readCurrentLineage(tx, scope,
    { kind: 'CURRENT_SESSION', credentials: scope.credentials })
  const enrollment = await readEnrollmentRow(tx, scope, session)
  if (enrollment.kind === 'LEGACY') return { kind: 'LEGACY' as const }
  if (enrollment.row.state !== 'ACTIVE' || journey.status !== 'ACTIVE') conflict('business admission retired')
  assertJourneyVersion(journey)
  const changed = await (tx as unknown as E2TxView).qualityJourney.updateMany({
    where: { id: journey.id, targetProjectId: journey.targetProjectId,
      currentCoordinatorSessionId: session.id, ownershipVersion: journey.ownershipVersion,
      e2AdmissionVersion: journey.e2AdmissionVersion, status: 'ACTIVE', hostingMode: journey.hostingMode },
    data: { e2AdmissionVersion: { increment: 1 } },
  })
  if (changed.count !== 1) conflict('business admission CAS')
  return { kind: 'E2_V1' as const, admissionVersion: journey.e2AdmissionVersion + 1 }
}

type E2RetirementReceipt = Readonly<{
  requestId: string
  requestedAt: Date
  requestReason: E2RetirementReason
  retirementId: string
}>

/** Irreversible request latch only. Effectiveness and slot release require separate exact evidence. */
export async function commitE2RetirementRequest(tx: Prisma.TransactionClient,
  scope: E2RetirementScope, reason: E2RetirementReason) {
  if (!isE2Id(scope.requestId) || !validDate(scope.requestedAt) || !reasons.includes(reason))
    throw new ServiceError('E2 retirement request fields are invalid.', 'VALIDATION')
  const requestId = scope.requestId
  const requestedAt = new Date(scope.requestedAt.getTime())
  const { journey, session } = await readCurrentLineage(tx, scope, scope.authority)
  const enrollment = await readEnrollmentRow(tx, scope, session)
  if (enrollment.kind === 'LEGACY') return { status: 'LEGACY_NO_E2' as const }
  const row = enrollment.row
  if (row.state !== 'ACTIVE') return { status: 'READ_ONLY_RECEIPT' as const,
    receipt: { requestId: row.requestId!, requestedAt: new Date(row.requestedAt!.getTime()),
      requestReason: row.requestReason as E2RetirementReason, retirementId: row.id } satisfies E2RetirementReceipt }
  assertJourneyVersion(journey)
  if (!isE2Uint(row.version, lastIncrementable)) conflict('retirement row version')
  const view = tx as unknown as E2TxView
  const admission = await view.qualityJourney.updateMany({
    where: { id: journey.id, targetProjectId: journey.targetProjectId,
      currentCoordinatorSessionId: session.id, ownershipVersion: journey.ownershipVersion,
      e2AdmissionVersion: journey.e2AdmissionVersion, status: journey.status,
      hostingMode: journey.hostingMode },
    data: { e2AdmissionVersion: { increment: 1 } },
  })
  if (admission.count !== 1) conflict('retirement admission CAS')
  const requested = await view.qualityJourneyE2Retirement.updateMany({
    where: { id: row.id, journeyId: journey.id, targetProjectId: journey.targetProjectId,
      coordinatorSessionId: session.id, generation: scope.generation,
      state: 'ACTIVE', version: row.version, requestId: null, requestedAt: null, requestReason: null },
    data: { state: 'RETIRE_REQUESTED', requestId,
      requestedAt, requestReason: reason, version: { increment: 1 } },
  })
  if (requested.count !== 1) conflict('retirement row CAS')
  return { status: 'RETIRE_REQUESTED' as const, admissionVersion: journey.e2AdmissionVersion + 1,
    receipt: { requestId, requestedAt: new Date(requestedAt.getTime()),
      requestReason: reason, retirementId: row.id } satisfies E2RetirementReceipt }
}
