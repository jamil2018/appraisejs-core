import type { TestRunDetailsTestCase } from './test-run-details-types'

export function getProgressStats(testCases: TestRunDetailsTestCase[]) {
  const total = testCases.length
  const completed = testCases.filter(
    testCase => testCase.status === 'COMPLETED' || testCase.status === 'CANCELLED',
  ).length

  return {
    total,
    completed,
    percentage: total > 0 ? (completed / total) * 100 : 0,
  }
}

export function getDurationSeconds(startedAt: Date, completedAt: Date | null) {
  if (!completedAt) {
    return null
  }

  return Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
}

export function getTraceViewerEligibleTestCases(testCases: TestRunDetailsTestCase[]) {
  return testCases.filter(testCase => testCase.result === 'FAILED' && Boolean(testCase.tracePath))
}
