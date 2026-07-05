import type { BrowserEngine, Environment } from '@prisma/client'
import type { SpawnedProcess } from '@/lib/process/task-spawner'

export interface TestRunExecutionRequest {
  testRunId: string
  environment: Environment
  tagExpression: string | null
  testWorkersCount: number
  browserEngine: BrowserEngine
  headless?: boolean
  projectRoot?: string
  featurePaths?: string[]
  importPaths?: string[]
  supportPaths?: string[]
  prepareWorkspace?: boolean
}

export interface TestRunExecutionResult {
  process: SpawnedProcess
  reportPath: string
}

export interface ExecutorAdapter {
  executeTestRun(config: TestRunExecutionRequest): Promise<TestRunExecutionResult>
  waitForProcess(processName: string): Promise<number | null>
  killProcess(processName: string, signal?: NodeJS.Signals): boolean
  getProcess(processName: string): SpawnedProcess | undefined
  spawnTraceViewer(testCaseId: string, tracePath: string): Promise<SpawnedProcess>
}
