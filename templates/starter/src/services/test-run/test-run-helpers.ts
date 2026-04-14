import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'
import { Prisma, TestRunResult, TestRunStatus } from '@prisma/client'
import { z } from 'zod'

export function buildOrExpression(expressions: string[]): string | null {
  if (expressions.length === 0) {
    return null
  }
  if (expressions.length === 1) {
    return expressions[0]
  }
  return expressions.join(' or ')
}

export function normalizeSuiteSelection(
  selection: z.infer<typeof testRunSchema>['testSuites'][number],
  availableTestCaseIds: string[],
) {
  if (selection.runAll) {
    return {
      testSuiteId: selection.testSuiteId,
      runAll: true,
      testCaseIds: [] as string[],
    }
  }

  const selectedTestCaseIds = selection.testCaseIds.filter(testCaseId => availableTestCaseIds.includes(testCaseId))

  if (selectedTestCaseIds.length === availableTestCaseIds.length) {
    return {
      testSuiteId: selection.testSuiteId,
      runAll: true,
      testCaseIds: [] as string[],
    }
  }

  return {
    testSuiteId: selection.testSuiteId,
    runAll: false,
    testCaseIds: selectedTestCaseIds,
  }
}

export function isCancelledOrCancellingStatus(status: TestRunStatus): boolean {
  return status === TestRunStatus.CANCELLED || status === TestRunStatus.CANCELLING
}

export function buildTestRunsWhereClause(filter?: string): Prisma.TestRunWhereInput {
  const whereClause: Prisma.TestRunWhereInput = {}
  if (filter === 'recentFailed') {
    const threshold = new Date()
    threshold.setDate(threshold.getDate() - RECENT_PERIOD_DAYS)
    whereClause.result = TestRunResult.FAILED
    whereClause.completedAt = {
      not: null,
      gte: threshold,
    }
  }
  return whereClause
}
