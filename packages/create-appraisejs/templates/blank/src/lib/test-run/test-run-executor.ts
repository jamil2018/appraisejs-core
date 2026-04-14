import type { TestRunExecutionRequest, TestRunExecutionResult } from '@/lib/executor/types'
import { localExecutorAdapter } from '@/lib/executor/local-executor-adapter'
import { getAutomationRunReportPath } from '@/lib/automation/automation-path-roots'

export type TestRunExecutionConfig = TestRunExecutionRequest

export function generateReportPath(testRunId: string): string {
  return getAutomationRunReportPath(testRunId)
}

export async function executeTestRun(config: TestRunExecutionConfig): Promise<TestRunExecutionResult> {
  return localExecutorAdapter.executeTestRun(config)
}
