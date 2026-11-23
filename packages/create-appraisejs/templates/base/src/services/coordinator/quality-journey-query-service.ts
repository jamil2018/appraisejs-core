import type { Prisma } from '@prisma/client'
import type { JourneyRuntimeStatus } from '@/lib/quality-journey/runtime-status'
import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

type JsonRecord = Record<string, string>

export type JourneyNavigationItem = {
  id: string
  kind: 'journey' | 'draft'
  title: string
  updatedAt: number
  status: string
}

export async function listRecentJourneyNavigation(projectIds: string[]) {
  if (!projectIds.length) return {}

  const orderBy = [{ updatedAt: 'desc' }, { id: 'asc' }] satisfies Prisma.QualityJourneyOrderByWithRelationInput[]
  const projects = await prisma.targetProject.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      qualityJourneys: {
        orderBy,
        take: 20,
        select: {
          id: true,
          updatedAt: true,
          status: true,
          stage: true,
          revisions: {
            orderBy: { revision: 'asc' },
            take: 1,
            select: { contentJson: true },
          },
        },
      },
      qualityJourneyDrafts: {
        where: { status: 'ACTIVE' },
        orderBy,
        take: 20,
        select: { id: true, updatedAt: true, requirementJson: true },
      },
    },
  })

  return Object.fromEntries(
    projects.map(project => {
      const journeys: JourneyNavigationItem[] = project.qualityJourneys.map(journey => ({
        id: journey.id,
        kind: 'journey',
        title: requirementSummary(journey.revisions[0]?.contentJson ?? '', 'Untitled Journey'),
        updatedAt: journey.updatedAt.getTime(),
        status: journey.status === 'ACTIVE' ? journey.stage : journey.status,
      }))
      const drafts: JourneyNavigationItem[] = project.qualityJourneyDrafts.map(draft => ({
        id: draft.id,
        kind: 'draft',
        title: requirementSummary(draft.requirementJson, 'Untitled brief'),
        updatedAt: draft.updatedAt.getTime(),
        status: 'DRAFT',
      }))
      return [project.id, [...journeys, ...drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)]
    }),
  )
}

function json(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringRecord(value: string): JsonRecord {
  const parsed = object(json(value))
  if (!parsed) return {}
  return Object.fromEntries(Object.entries(parsed).filter(([, item]) => typeof item === 'string')) as JsonRecord
}

function stringArray(value: string): string[] {
  const parsed = json(value)
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}

function requirementSummary(value: string, fallback = 'Requirement snapshot unavailable') {
  const objective = object(json(value))?.objective
  return typeof objective === 'string' && objective.trim() ? objective : fallback
}

export type QualityJourneyStatusSnapshot = {
  journeyId: string
  targetProjectId: string
  runtimeStatus: JourneyRuntimeStatus | null
  observedAt: string
  closed: boolean
  activity?: {
    id: string
    workItemId: string
    role: string
    status: string
    dispatchAdapterId: string
    startedAt: string
    completedAt: string | null
    leaseExpiresAt: string
    criteriaSubmissionInterrupted?: boolean
    needsRecovery: boolean
    running: boolean
    phase?: { kind: string; at: string; path?: string }
  } | null
  lifecycle: {
    stage: string
    status: string
    version: number
    stateHash: string
    activeCycleId: string
    activeRevisionIds: JsonRecord
    analysisReviewHash: string | null
  }
  attention: {
    unresolvedQuestionCount: number
    awaitingExecutionConsent?: boolean
    activeBlockers: Array<{
      id: string
      reasonCode: string
      summary: string
      responsibleActor: string
      requiredResolution: string
    }>
    activeWork: Array<{ id: string; role: string; status: string; updatedAt: string }>
  }
}

function statusSelection(targetProjectId: string) {
  return {
    id: true,
    targetProjectId: true,
    hostingMode: true,
    currentCoordinatorSessionId: true,
    currentCoordinatorSession: { select: { generation: true } },
    activeWorkItemIdsJson: true,
    providerRuns: {
      where: {
        targetProjectId,
        status: { in: ['UNKNOWN', 'ACKNOWLEDGED', 'CONFLICT'] },
      },
      select: {
        status: true,
        sessionId: true,
        unresolvedRetentionAt: true,
        attempt: {
          select: {
            attempt: true,
            status: true,
            leaseExpiresAt: true,
            workItem: { select: { cycleId: true, currentAttempt: true, status: true } },
          },
        },
        intents: {
          where: { sendBoundaryId: { not: null }, reconciledAt: null },
          orderBy: { turnOrdinal: 'desc' },
          take: 1,
          select: { acknowledgedAt: true, acknowledgementDueAt: true, turnDueAt: true },
        },
      },
    },
    stage: true,
    status: true,
    version: true,
    stateHash: true,
    activeCycleId: true,
    activeRevisionIdsJson: true,
    analysisReviewHash: true,
    unresolvedQuestionIdsJson: true,
    executionConsents: { where: { status: 'REQUESTED', targetProjectId }, take: 1, select: { id: true } },
    blockers: {
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        reasonCode: true,
        summary: true,
        responsibleActor: true,
        requiredResolution: true,
      },
    },
    workItems: {
      where: {
        targetProjectId,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        status: true,
        updatedAt: true,
        cycleId: true,
        currentAttempt: true,
        attempts: {
          orderBy: { attempt: 'desc' },
          take: 1,
          select: {
            id: true,
            attempt: true,
            status: true,
            startedAt: true,
            completedAt: true,
            leaseExpiresAt: true,
            dispatchAdapterId: true,
            dispatchReservedAt: true,
            dispatchStartedAt: true,
            failureJson: true,
            sessionBinding: { select: { sessionId: true, coordinatorGeneration: true } },
            providerRun: { select: { status: true } },
          },
        },
      },
    },
  } satisfies Prisma.QualityJourneySelect
}

type RuntimeObservation = Prisma.QualityJourneyGetPayload<{ select: ReturnType<typeof statusSelection> }>

type ProviderRunObservation = RuntimeObservation['providerRuns'][number]
type WorkObservation = RuntimeObservation['workItems'][number]

function providerRunIsCurrent(run: ProviderRunObservation, journey: RuntimeObservation, now: Date) {
  const { workItem, ...attempt } = run.attempt
  return (
    run.sessionId === journey.currentCoordinatorSessionId &&
    workItem.cycleId === journey.activeCycleId &&
    attempt.attempt === workItem.currentAttempt &&
    attempt.leaseExpiresAt > now &&
    !['CANCELLED', 'SUPERSEDED'].includes(workItem.status) &&
    attempt.status !== 'DISPATCH_UNRESOLVED' &&
    !(attempt.status === 'COMPLETED' && workItem.status === 'ELIGIBLE')
  )
}

function hasLiveAcknowledgedTurn(
  intent: ProviderRunObservation['intents'][number],
  acknowledgementDueAt: Date,
  now: Date,
) {
  return (
    intent.acknowledgedAt && intent.acknowledgedAt < acknowledgementDueAt && intent.turnDueAt && intent.turnDueAt > now
  )
}

function dispatchActivity(run: ProviderRunObservation, now: Date): JourneyRuntimeStatus | null {
  const intent = run.intents[0]
  if (run.status === 'CONFLICT' || run.unresolvedRetentionAt <= now || !intent?.acknowledgementDueAt) return 'RECOVERY'
  if (run.status === 'UNKNOWN') return intent.acknowledgementDueAt <= now ? 'RECOVERY' : 'QUEUED'
  if (!hasLiveAcknowledgedTurn(intent, intent.acknowledgementDueAt, now)) return 'RECOVERY'
  return run.attempt.workItem.status === 'COMPLETED' ? null : 'RUNNING'
}

function providerActivity(journey: RuntimeObservation, now: Date): JourneyRuntimeStatus | null {
  let activity: JourneyRuntimeStatus | null = null
  for (const run of journey.providerRuns) {
    if (!providerRunIsCurrent(run, journey, now)) return 'RECOVERY'
    const observed = dispatchActivity(run, now)
    if (observed === 'RECOVERY') return observed
    if (observed === 'RUNNING') activity = observed
    else activity ??= observed
  }
  return activity
}

function attemptNeedsRecovery(attempt: WorkObservation['attempts'][number], now: Date) {
  const local = localAttemptActivity(attempt, now)
  return (
    local === 'RECOVERY' ||
    attempt.status === 'DISPATCH_UNRESOLVED' ||
    (['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'].includes(attempt.status) && attempt.leaseExpiresAt <= now)
  )
}

function localAttemptActivity(attempt: WorkObservation['attempts'][number], now: Date): JourneyRuntimeStatus | null {
  if (!attempt.dispatchAdapterId?.startsWith('APP_SERVER_LOCAL_V1_')) return null
  const failure = attempt.failureJson ? object(json(attempt.failureJson)) : null
  if (
    failure?.canonicalRecoveryOutcome === 'ACCEPTED' &&
    attempt.status === 'COMPLETED' &&
    !attempt.dispatchStartedAt &&
    !attempt.dispatchReservedAt
  )
    return null
  // The initial marker records consumption before I/O; it is not evidence that the provider failed.
  if (failure?.stage || attempt.status === 'DISPATCH_UNRESOLVED') return 'RECOVERY'
  if (['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(attempt.status)) return null
  if (attempt.dispatchStartedAt || attempt.dispatchReservedAt)
    return attempt.leaseExpiresAt > now ? 'RUNNING' : 'RECOVERY'
  return null
}

function currentManagedActivity(journey: RuntimeObservation, now: Date): QualityJourneyStatusSnapshot['activity'] {
  const activeIds = stringArray(journey.activeWorkItemIdsJson)
  const current = journey.workItems
    .flatMap(item =>
      item.cycleId !== journey.activeCycleId || !activeIds.includes(item.id)
        ? []
        : item.attempts
            .filter(
              attempt =>
                attempt.attempt === item.currentAttempt &&
                attempt.dispatchAdapterId?.startsWith('APP_SERVER_LOCAL_V1_') &&
                attempt.sessionBinding?.sessionId === journey.currentCoordinatorSessionId &&
                attempt.sessionBinding?.coordinatorGeneration === journey.currentCoordinatorSession?.generation,
            )
            .map(attempt => ({ item, attempt })),
    )
    .sort(
      (a, b) =>
        (b.attempt.dispatchStartedAt ?? b.attempt.dispatchReservedAt ?? b.attempt.startedAt).getTime() -
        (a.attempt.dispatchStartedAt ?? a.attempt.dispatchReservedAt ?? a.attempt.startedAt).getTime(),
    )[0]
  if (!current) return null
  const { item, attempt } = current
  const activity = localAttemptActivity(attempt, now)
  const phase =
    attempt.failureJson && item.role === 'REQUIREMENT_ANALYZER'
      ? object(object(json(attempt.failureJson))?.activity)
      : null
  const confirmedPhase =
    phase &&
    typeof phase.at === 'string' &&
    Number.isFinite(Date.parse(phase.at)) &&
    (phase.kind === 'WRITING' || phase.kind === 'INSPECTING')
      ? {
          kind: phase.kind,
          at: phase.at,
          path: typeof phase.path === 'string' && /^\/[a-zA-Z0-9/_-]{0,100}$/.test(phase.path) ? phase.path : undefined,
        }
      : undefined
  return {
    phase: confirmedPhase,
    criteriaSubmissionInterrupted:
      item.role === 'REQUIREMENT_ANALYZER' &&
      activity === 'RECOVERY' &&
      Boolean(attempt.failureJson && object(json(attempt.failureJson))?.stage === 'CANONICAL_SUBMISSION'),
    id: attempt.id,
    workItemId: item.id,
    role: item.role,
    status: attempt.status,
    dispatchAdapterId: attempt.dispatchAdapterId!,
    startedAt: (attempt.dispatchStartedAt ?? attempt.dispatchReservedAt ?? attempt.startedAt).toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    leaseExpiresAt: attempt.leaseExpiresAt.toISOString(),
    needsRecovery: activity === 'RECOVERY',
    running: activity === 'RUNNING',
  }
}

function hasOpenHumanGate(journey: RuntimeObservation, questionCount: number, work: WorkObservation[]) {
  return (
    questionCount > 0 ||
    journey.executionConsents.length > 0 ||
    ['ANALYSIS_REVIEW', 'SCENARIO_REVIEW', 'REPORT_REVIEW'].includes(journey.stage) ||
    work.some(item => ['QUESTION_RAISED', 'WAITING_FOR_INPUT'].includes(item.status))
  )
}

function pendingRuntimeWork(
  work: WorkObservation[],
  attempts: WorkObservation['attempts'],
  hasSession: boolean,
): JourneyRuntimeStatus {
  // A reissued Analysis item retains its completed predecessor until the next claim.
  if (
    attempts.some(
      attempt =>
        attempt.status !== 'COMPLETED' &&
        ['NONSTART_RECONCILED', 'TERMINAL_RECONCILED'].includes(attempt.providerRun?.status ?? ''),
    )
  )
    return 'RECOVERY'

  const queued = work.some(item =>
    [
      'ELIGIBLE',
      'WORK_ITEM_ISSUED',
      'WORKER_REQUESTED',
      'WORKER_STARTED',
      'IN_PROGRESS',
      'REPLACEMENT_REQUESTED',
    ].includes(item.status),
  )
  if (!queued) return 'UNOBSERVED'
  return hasSession ? 'QUEUED' : 'BLOCKED'
}

function lifecycleRuntimeStatus(
  journey: RuntimeObservation,
  unresolvedQuestionCount: number,
  work: WorkObservation[],
): JourneyRuntimeStatus | null {
  if (journey.blockers.length || work.some(item => ['BLOCKED', 'ESCALATED', 'LEASE_EXPIRED'].includes(item.status)))
    return 'BLOCKED'
  return hasOpenHumanGate(journey, unresolvedQuestionCount, work) ? 'WAITING' : null
}

function projectRuntimeStatus(
  journey: RuntimeObservation,
  unresolvedQuestionCount: number,
  now: Date,
): JourneyRuntimeStatus | null {
  if (journey.hostingMode === 'EXTERNAL_LEGACY') return null
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || journey.status !== 'ACTIVE') return 'RECOVERY'

  const activeIds = stringArray(journey.activeWorkItemIdsJson)
  const work = journey.workItems.filter(item => {
    if (item.cycleId !== journey.activeCycleId) return false
    // A retired assignment's failure remains evidence. Once all local effects are
    // reconciled it should no longer label its successor as stalled.
    const retired = item.status === 'SUPERSEDED' && !activeIds.includes(item.id)
    return (
      !retired ||
      item.attempts.some(
        attempt => attempt.dispatchStartedAt || attempt.dispatchReservedAt || attempt.status === 'DISPATCH_UNRESOLVED',
      )
    )
  })
  const attempts = work.flatMap(item => item.attempts.filter(attempt => attempt.attempt === item.currentAttempt))
  const activity = providerActivity(journey, now)
  if (activity === 'RECOVERY' || attempts.some(attempt => attemptNeedsRecovery(attempt, now))) return 'RECOVERY'
  return (
    lifecycleRuntimeStatus(journey, unresolvedQuestionCount, work) ??
    activity ??
    (attempts.some(attempt => localAttemptActivity(attempt, now) === 'RUNNING') ? 'RUNNING' : null) ??
    pendingRuntimeWork(work, attempts, Boolean(journey.currentCoordinatorSessionId))
  )
}

/**
 * A deliberately small read model for UI observation. It does not construct
 * lifecycle commands, authorize work, or return stored artifact payloads.
 */
export async function getQualityJourneyStatusSnapshot(input: {
  journeyId: string
  targetProjectId: string
}): Promise<QualityJourneyStatusSnapshot> {
  const journey = await prisma.$transaction(tx =>
    tx.qualityJourney.findFirst({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
      select: statusSelection(input.targetProjectId),
    }),
  )
  if (!journey) throw new ServiceError('Quality Journey was not found in the active project.', 'NOT_FOUND')

  const now = new Date()
  const closed = journey.stage === 'CLOSED' || journey.status === 'CLOSED'
  const unresolvedQuestionCount = stringArray(journey.unresolvedQuestionIdsJson).length
  return {
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    runtimeStatus: closed ? null : projectRuntimeStatus(journey, unresolvedQuestionCount, now),
    observedAt: now.toISOString(),
    closed,
    activity: journey.hostingMode === 'APP_SERVER_LOCAL_V1' ? currentManagedActivity(journey, now) : null,
    lifecycle: {
      stage: journey.stage,
      status: journey.status,
      version: journey.version,
      stateHash: journey.stateHash,
      activeCycleId: journey.activeCycleId,
      activeRevisionIds: stringRecord(journey.activeRevisionIdsJson),
      analysisReviewHash: journey.analysisReviewHash,
    },
    attention: {
      unresolvedQuestionCount,
      awaitingExecutionConsent: Boolean(journey.executionConsents?.length),
      activeBlockers: journey.blockers,
      activeWork: journey.workItems
        .filter(item => !['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(item.status))
        .map(({ id, role, status, updatedAt }) => ({
          id,
          role,
          status,
          updatedAt: updatedAt.toISOString(),
        })),
    },
  }
}

/** Read-only, project-scoped summaries for the Journey overview list. The
 * presentation layer receives only stable identifiers and compact projections. */
export async function listQualityJourneys(input: { targetProjectId: string }) {
  const journeys = await prisma.qualityJourney.findMany({
    where: { targetProjectId: input.targetProjectId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: {
      revisions: { orderBy: { revision: 'asc' }, take: 1 },
      _count: { select: { analysisRevisions: true } },
      blockers: {
        where: { status: 'ACTIVE' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { responsibleActor: true },
      },
      executionConsents: { where: { status: 'REQUESTED' }, select: { id: true } },
    },
  })

  return journeys.map(journey => ({
    id: journey.id,
    hostingMode: journey.hostingMode,
    stage: journey.stage,
    status: journey.status,
    activeCycleId: journey.activeCycleId,
    activeRevisionIds: stringRecord(journey.activeRevisionIdsJson),
    unresolvedQuestionIds: stringArray(journey.unresolvedQuestionIdsJson),
    createdAt: journey.createdAt,
    updatedAt: journey.updatedAt,
    requirement: journey.revisions[0]
      ? {
          id: journey.revisions[0].id,
          revision: journey.revisions[0].revision,
          contentHash: journey.revisions[0].contentHash,
          summary: requirementSummary(journey.revisions[0].contentJson),
        }
      : null,
    analysisRevisionCount: journey._count.analysisRevisions,
    activeBlockerCount: journey.blockers.length,
    blockerResponsibleActor: journey.blockers[0]?.responsibleActor ?? null,
    requestedExecutionConsentCount: journey.executionConsents?.length ?? 0,
  }))
}
