import type { TestRunDetailsData } from './test-run-details-helpers'

export type TestRunExitEventDetail = {
  testRunId: string
}

export type TestRunHeaderPollMode = 'status' | 'report' | null

export function getTestRunHeaderPollMode(testRun: TestRunDetailsData): TestRunHeaderPollMode {
  if (testRun.status !== 'COMPLETED' && testRun.status !== 'CANCELLED') {
    return 'status'
  }

  if (testRun.status === 'COMPLETED' && testRun.reports.length === 0) {
    return 'report'
  }

  return null
}

export function matchesTestRunExitEvent(detail: TestRunExitEventDetail | undefined, runId: string) {
  return detail?.testRunId === runId
}
