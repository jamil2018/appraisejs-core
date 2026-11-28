import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey'
import { withProjectScope } from '@/lib/project-scope'
import { compareProjectReports } from '@/services/report/report-comparison-service'

export function parseConversationReportRequest(content: string) {
  const normalized = content
    .trim()
    .replace(/[.!?]$/, '')
    .toLowerCase()
  if (normalized === 'show recent reports' || normalized === 'show reports') return { kind: 'RECENT' as const }
  if (normalized === 'compare latest reports') return { kind: 'COMPARE_LATEST' as const }
  return null
}

/** Project-scoped, bounded facts from persisted report/run records; no provider-authored verdict. */
export async function answerConversationReportRequest(
  targetProjectId: string,
  request: NonNullable<ReturnType<typeof parseConversationReportRequest>>,
  client: PrismaClient = prisma,
) {
  qualityJourneyIdentifierSchema.parse(targetProjectId)
  const reports = await client.report.findMany({
    where: { targetProjectId, testRun: { targetProjectId } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      testRun: { select: { id: true, name: true, status: true, result: true, evidenceHealth: true } },
    },
  })
  const items = reports.map(report => ({
    id: report.id,
    name: report.testRun.name,
    status: report.testRun.status,
    result: report.testRun.result,
    evidenceHealth: report.testRun.evidenceHealth,
    createdAt: report.createdAt,
    href: withProjectScope(`/reports/${encodeURIComponent(report.id)}`, targetProjectId),
  }))
  if (request.kind === 'RECENT') return { kind: 'RECENT' as const, items }
  if (reports.length < 2) return { kind: 'COMPARE_LATEST' as const, items, comparison: null }
  return {
    kind: 'COMPARE_LATEST' as const,
    items,
    comparison: await compareProjectReports(
      { targetProjectId, baselineReportId: reports[1].id, candidateReportId: reports[0].id },
      client,
    ),
  }
}
