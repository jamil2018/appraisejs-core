export type { TestRunDetailsData, TestRunEvidenceHealth } from './test-run-details-types'
export { getTestRunDetailsData, getTraceViewerStatusData } from './test-run-details-guards'
export {
  getEvidenceHealthMeta,
  getTestCaseResultMeta,
  getTestCaseStatusMeta,
  getTestRunResultText,
  getTestRunStatusMeta,
  isTerminalTestRunStatus,
} from './test-run-details-status'
export { getDurationSeconds, getProgressStats, getTraceViewerEligibleTestCases } from './test-run-details-progress'
