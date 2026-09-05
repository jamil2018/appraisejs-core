import type { Prisma, PrismaClient } from '@prisma/client'
import { hashQualityJourneyExecutionValue as hash, qualityJourneyTriageReportSchema } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

/** A cycle's scenario subset is authority only when backed by an exact immutable
 * local report approval. Free-form cycle JSON cannot grant remediation rights. */
export async function qualityJourneyRemediationScope(
  journeyId: string,
  cycleId: string,
  db: PrismaClient | Prisma.TransactionClient,
) {
  const cycle = await db.qualityJourneyCycle.findFirst({ where: { id: cycleId, journeyId } })
  if (!cycle) throw new ServiceError('Journey cycle is unavailable.', 'CONFLICT')
  const scope = JSON.parse(cycle.scopeJson)
  if (!scope.remediation) return null
  const approval = await db.qualityJourneyReportReview.findFirst({
    where: { journeyId, successorCycleId: cycleId, kind: 'AUTOMATION_CORRECTION_APPROVED' },
    include: { report: { include: { assignment: true } } },
  })
  const report = approval ? qualityJourneyTriageReportSchema.parse(JSON.parse(approval.report.reportJson)) : null
  if (!approval || !report?.remediation)
    throw new ServiceError('Remediation requires a persisted exact report approval.', 'UNAUTHORIZED')
  const expected = {
    reportRevisionId: approval.report.id,
    reportHash: approval.report.contentHash,
    sourceExecutionCycleId: approval.report.assignment.executionCycleId,
    ...report.remediation,
  }
  if (hash(scope.remediation) !== hash(expected) || scope.scopeHash !== hash(expected))
    throw new ServiceError('Remediation cycle scope is stale or broadened.', 'CONFLICT')
  return expected
}
