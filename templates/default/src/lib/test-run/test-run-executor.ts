import type { TestRunExecutionRequest, TestRunExecutionResult } from '@/lib/executor/types'
import { localExecutorAdapter } from '@/lib/executor/local-executor-adapter'
import { getAutomationReportsDir } from '@/lib/automation/paths'
import { join } from 'path'

export type TestRunExecutionConfig = TestRunExecutionRequest

export function generateReportPath(testRunId: string): string {
  const timestamp = Date.now()
  return join(getAutomationReportsDir(), `cucumber-${testRunId}-${timestamp}.json`)
}

export async function executeTestRun(config: TestRunExecutionConfig): Promise<TestRunExecutionResult> {
  return localExecutorAdapter.executeTestRun(config)
}
