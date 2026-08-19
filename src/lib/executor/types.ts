import type { SpawnedProcess } from '@/lib/process/task-spawner'

export interface TestRunExecutionResult {
  process: SpawnedProcess
  reportPath: string
}
