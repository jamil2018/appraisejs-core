import type { TestRunExecutionResult } from '@/lib/executor/types'

export type ExecuteRunInput = Readonly<{
  launch: () => Promise<TestRunExecutionResult>
}>

export async function executeRun(input: ExecuteRunInput): Promise<TestRunExecutionResult> {
  return input.launch()
}
