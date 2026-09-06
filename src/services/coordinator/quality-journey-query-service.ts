import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

type JsonRecord = Record<string, string>

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

function requirementSummary(value: string) {
  const objective = object(json(value))?.objective
  return typeof objective === 'string' && objective.trim() ? objective : 'Requirement snapshot unavailable'
}

export type QualityJourneyStatusSnapshot = {
  journeyId: string
  observedAt: string
  closed: boolean
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

/**
 * A deliberately small read model for UI observation. It does not construct
 * lifecycle commands, authorize work, or return stored artifact payloads.
 */
export async function getQualityJourneyStatusSnapshot(input: {
  journeyId: string
  targetProjectId: string
}): Promise<QualityJourneyStatusSnapshot> {
  const journey = await prisma.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: {
      id: true,
      stage: true,
      status: true,
      version: true,
      stateHash: true,
      activeCycleId: true,
      activeRevisionIdsJson: true,
      analysisReviewHash: true,
      unresolvedQuestionIdsJson: true,
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
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'],
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, role: true, status: true, updatedAt: true },
      },
    },
  })
  if (!journey) throw new ServiceError('Quality Journey was not found in the active project.', 'NOT_FOUND')

  return {
    journeyId: journey.id,
    observedAt: new Date().toISOString(),
    closed: journey.stage === 'CLOSED' || journey.status === 'CLOSED',
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
      unresolvedQuestionCount: stringArray(journey.unresolvedQuestionIdsJson).length,
      activeBlockers: journey.blockers,
      activeWork: journey.workItems.map(item => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
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
      _count: { select: { analysisRevisions: true, blockers: { where: { status: 'ACTIVE' } } } },
      executionConsents: { where: { status: 'REQUESTED' }, select: { id: true } },
    },
  })

  return journeys.map(journey => ({
    id: journey.id,
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
    activeBlockerCount: journey._count.blockers,
    requestedExecutionConsentCount: journey.executionConsents?.length ?? 0,
  }))
}
