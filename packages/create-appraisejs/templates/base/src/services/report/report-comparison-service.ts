import type { PrismaClient, TestRunTestCaseResult } from '@prisma/client'

import prisma from '@/config/db-config'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

type Input = { targetProjectId: string; baselineReportId: string; candidateReportId: string }

/** Compare two exact reports in one project, using only persisted run and case outcomes. */
export async function compareProjectReports(input: Input, client: PrismaClient = prisma) {
  qualityJourneyIdentifierSchema.parse(input.targetProjectId)
  qualityJourneyIdentifierSchema.parse(input.baselineReportId)
  qualityJourneyIdentifierSchema.parse(input.candidateReportId)
  if (input.baselineReportId === input.candidateReportId)
    throw new ServiceError('Choose two different reports to compare.', 'VALIDATION', 400)
  const reports = await client.report.findMany({
    where: {
      id: { in: [input.baselineReportId, input.candidateReportId] },
      targetProjectId: input.targetProjectId,
      testRun: { targetProjectId: input.targetProjectId },
    },
    select: {
      id: true,
      testRun: {
        select: {
          id: true,
          runId: true,
          name: true,
          status: true,
          result: true,
          evidenceHealth: true,
          completedAt: true,
        },
      },
      testCases: {
        select: {
          testCaseId: true,
          testRunTestCase: { select: { result: true, testCase: { select: { title: true } } } },
        },
      },
    },
    take: 2,
  })
  const baseline = reports.find(report => report.id === input.baselineReportId)
  const candidate = reports.find(report => report.id === input.candidateReportId)
  if (!baseline || !candidate) throw new ServiceError('Scoped report comparison was not found.', 'NOT_FOUND', 404)
  const cases = new Map<
    string,
    { title: string; baseline: TestRunTestCaseResult | null; candidate: TestRunTestCaseResult | null }
  >()
  for (const item of baseline.testCases) {
    cases.set(item.testCaseId, {
      title: item.testRunTestCase.testCase.title,
      baseline: item.testRunTestCase.result,
      candidate: null,
    })
  }
  for (const item of candidate.testCases) {
    const current = cases.get(item.testCaseId)
    cases.set(item.testCaseId, {
      title: item.testRunTestCase.testCase.title,
      baseline: current?.baseline ?? null,
      candidate: item.testRunTestCase.result,
    })
  }
  const project = (report: typeof baseline) => ({
    reportId: report.id,
    testRunId: report.testRun.id,
    runId: report.testRun.runId,
    name: report.testRun.name,
    status: report.testRun.status,
    result: report.testRun.result,
    evidenceHealth: report.testRun.evidenceHealth,
    completedAt: report.testRun.completedAt,
  })
  return {
    baseline: project(baseline),
    candidate: project(candidate),
    cases: [...cases.entries()]
      .map(([testCaseId, value]) => ({ testCaseId, ...value }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.testCaseId.localeCompare(right.testCaseId)),
  }
}
