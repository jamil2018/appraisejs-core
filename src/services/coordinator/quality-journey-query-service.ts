import prisma from '@/config/db-config'

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

/** Read-only, project-scoped summaries for the Journey overview list. The
 * presentation layer receives only stable identifiers and compact projections. */
export async function listQualityJourneys(input: { targetProjectId: string }) {
  const journeys = await prisma.qualityJourney.findMany({
    where: { targetProjectId: input.targetProjectId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: {
      revisions: { orderBy: { revision: 'asc' }, take: 1 },
      _count: { select: { analysisRevisions: true, blockers: { where: { status: 'ACTIVE' } } } },
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
  }))
}
