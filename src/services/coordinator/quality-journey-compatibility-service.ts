import { Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

const defaultLimit = 40
const maxLimit = 100

const summarySelect = {
  id: true,
  qualityPlanId: true,
  revision: true,
  status: true,
  contentHash: true,
  methodologyId: true,
  methodologyVersion: true,
  methodologyHash: true,
  predecessorRevisionId: true,
  approvedAt: true,
  createdAt: true,
  qualityPlan: { select: { id: true, title: true, description: true } },
  _count: {
    select: {
      requirementSnapshots: true,
      requirementAnalyses: true,
      validationDesigns: true,
      validationVersions: true,
      assessments: true,
    },
  },
} satisfies Prisma.QualityPlanRevisionSelect

const detailSelect = {
  ...summarySelect,
  requirementSnapshots: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, externalRef: true, text: true, kind: true, contentHash: true, createdAt: true },
  },
  requirementAnalyses: {
    orderBy: { revision: 'asc' },
    select: {
      id: true,
      revision: true,
      status: true,
      decision: true,
      analysisHash: true,
      decisionRationale: true,
      decidedBy: true,
      decidedAt: true,
      approvedAt: true,
      approvedBy: true,
      approvalHash: true,
      createdAt: true,
    },
  },
  validationDesigns: {
    orderBy: { revision: 'asc' },
    select: {
      id: true,
      requirementAnalysisRevisionId: true,
      revision: true,
      status: true,
      decision: true,
      designHash: true,
      decisionRationale: true,
      decidedBy: true,
      decidedAt: true,
      approvedAt: true,
      approvedBy: true,
      approvalHash: true,
      createdAt: true,
    },
  },
  validationVersions: {
    orderBy: [{ validationIdentity: 'asc' }, { version: 'asc' }],
    select: {
      id: true,
      validationDesignRevisionId: true,
      validationIdentity: true,
      version: true,
      status: true,
      reuseOutcome: true,
      canonicalHash: true,
      realizationHash: true,
      compilationHash: true,
      scenarioApprovedAt: true,
      scenarioApprovedBy: true,
      scenarioApprovalHash: true,
      publishedAt: true,
      createdAt: true,
    },
  },
  assessments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      qualityPlanId: true,
      evaluationSubjectRevisionId: true,
      status: true,
      alignment: true,
      observedAssurance: true,
      lineageId: true,
      generation: true,
      baselineAssessmentId: true,
      supersedesAssessmentId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.QualityPlanRevisionSelect

type Summary = Prisma.QualityPlanRevisionGetPayload<{ select: typeof summarySelect }>
type Detail = Prisma.QualityPlanRevisionGetPayload<{ select: typeof detailSelect }>

function page(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value ?? fallback), 0), maximum)
}

function envelope(targetProjectId: string) {
  return {
    schema: 'appraise.quality-journey-compatibility/v1' as const,
    schemaVersion: 1,
    compatibility: 'READ_ONLY' as const,
    journeyAuthority: 'NONE' as const,
    reason: 'NO_PROVEN_JOURNEY_LINEAGE' as const,
    targetProjectId,
  }
}

function summary(record: Summary) {
  return {
    qualityPlan: record.qualityPlan,
    revision: {
      id: record.id,
      qualityPlanId: record.qualityPlanId,
      revision: record.revision,
      status: record.status,
      contentHash: record.contentHash,
      methodologyId: record.methodologyId,
      methodologyVersion: record.methodologyVersion,
      methodologyHash: record.methodologyHash,
      predecessorRevisionId: record.predecessorRevisionId,
      approvedAt: record.approvedAt,
      createdAt: record.createdAt,
    },
    counts: record._count,
  }
}

function detail(record: Detail) {
  return {
    ...summary(record),
    requirementSnapshots: record.requirementSnapshots.map(item => ({
      id: item.id,
      externalRef: item.externalRef,
      text: item.text,
      kind: item.kind,
      contentHash: item.contentHash,
      createdAt: item.createdAt,
    })),
    requirementAnalyses: record.requirementAnalyses.map(item => ({
      id: item.id,
      revision: item.revision,
      status: item.status,
      decision: item.decision,
      analysisHash: item.analysisHash,
      decisionRationale: item.decisionRationale,
      decidedBy: item.decidedBy,
      decidedAt: item.decidedAt,
      approvedAt: item.approvedAt,
      approvedBy: item.approvedBy,
      approvalHash: item.approvalHash,
      createdAt: item.createdAt,
    })),
    validationDesigns: record.validationDesigns.map(item => ({
      id: item.id,
      requirementAnalysisRevisionId: item.requirementAnalysisRevisionId,
      revision: item.revision,
      status: item.status,
      decision: item.decision,
      designHash: item.designHash,
      decisionRationale: item.decisionRationale,
      decidedBy: item.decidedBy,
      decidedAt: item.decidedAt,
      approvedAt: item.approvedAt,
      approvedBy: item.approvedBy,
      approvalHash: item.approvalHash,
      createdAt: item.createdAt,
    })),
    validationVersions: record.validationVersions.map(item => ({
      id: item.id,
      validationDesignRevisionId: item.validationDesignRevisionId,
      validationIdentity: item.validationIdentity,
      version: item.version,
      status: item.status,
      reuseOutcome: item.reuseOutcome,
      canonicalHash: item.canonicalHash,
      realizationHash: item.realizationHash,
      compilationHash: item.compilationHash,
      scenarioApprovedAt: item.scenarioApprovedAt,
      scenarioApprovedBy: item.scenarioApprovedBy,
      scenarioApprovalHash: item.scenarioApprovalHash,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
    })),
    assessments: record.assessments.map(item => ({
      id: item.id,
      qualityPlanId: item.qualityPlanId,
      evaluationSubjectRevisionId: item.evaluationSubjectRevisionId,
      status: item.status,
      alignment: item.alignment,
      observedAssurance: item.observedAssurance,
      lineageId: item.lineageId,
      generation: item.generation,
      baselineAssessmentId: item.baselineAssessmentId,
      supersedesAssessmentId: item.supersedesAssessmentId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  }
}

export async function readQualityJourneyCompatibility(
  input: {
    targetProjectId: string
    qualityPlanId?: string
    revisionId?: string
    offset?: number
    limit?: number
  },
  client: Db = prisma,
) {
  const hasPlan = Boolean(input.qualityPlanId)
  const hasRevision = Boolean(input.revisionId)
  if (hasPlan !== hasRevision)
    throw new ServiceError('qualityPlanId and revisionId must be supplied together.', 'VALIDATION', 400)

  const offset = page(input.offset, 0, Number.MAX_SAFE_INTEGER)
  const limit = page(input.limit, defaultLimit, maxLimit) || defaultLimit
  const where = {
    targetProjectId: input.targetProjectId,
    ...(hasPlan ? { qualityPlanId: input.qualityPlanId!, id: input.revisionId! } : {}),
  }

  if (hasPlan) {
    const record = await client.qualityPlanRevision.findFirst({ where, select: detailSelect })
    if (!record)
      throw new ServiceError('Quality Plan revision was not found for the requested target.', 'NOT_FOUND', 404)
    return {
      ...envelope(input.targetProjectId),
      page: { offset, limit, maxLimit, total: 1 },
      entries: [summary(record)],
      detail: detail(record),
    }
  }

  const [total, records] = await Promise.all([
    client.qualityPlanRevision.count({ where }),
    client.qualityPlanRevision.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
  ])
  return {
    ...envelope(input.targetProjectId),
    page: { offset, limit, maxLimit, total },
    entries: records.map(summary),
    detail: null,
  }
}
