import { join } from 'path'
import { spawnTask, taskSpawner, type SpawnedProcess, waitForTask, killTask } from '@/lib/process/task-spawner'
import { ensureAutomationWorkspaceReady, getAutomationReportsDir } from '@/lib/automation/paths'
import type { ExecutorAdapter, TestRunExecutionRequest, TestRunExecutionResult } from './types'
import { processManager } from '@/lib/test-run/process-manager'

function mapBrowserEngineToName(browserEngine: TestRunExecutionRequest['browserEngine']): 'chromium' | 'firefox' | 'webkit' {
  switch (browserEngine) {
    case 'CHROMIUM':
      return 'chromium'
    case 'FIREFOX':
      return 'firefox'
    case 'WEBKIT':
      return 'webkit'
    default:
      return 'chromium'
  }
}

function combineTagExpressions(tags: TestRunExecutionRequest['tags']): string | null {
  if (tags.length === 0) {
    return null
  }

  if (tags.length === 1) {
    return tags[0].tagExpression
  }

  return tags.map(tag => `(${tag.tagExpression})`).join(' or ')
}

function generateReportPath(testRunId: string): string {
  const timestamp = Date.now()
  return join(getAutomationReportsDir(), `cucumber-${testRunId}-${timestamp}.json`)
}

export class LocalExecutorAdapter implements ExecutorAdapter {
  async executeTestRun(config: TestRunExecutionRequest): Promise<TestRunExecutionResult> {
    await ensureAutomationWorkspaceReady()

    const { testRunId, environment, tags, testWorkersCount, browserEngine, headless = true } = config
    const reportPath = generateReportPath(testRunId)
    const browserName = mapBrowserEngineToName(browserEngine)

    process.env.ENVIRONMENT = environment.name
    process.env.HEADLESS = headless.toString()
    process.env.BROWSER = browserName
    process.env.REPORT_PATH = reportPath

    const cucumberArgs: string[] = ['cucumber-js']
    const tagExpression = combineTagExpressions(tags)

    if (tagExpression) {
      cucumberArgs.push('-t', tagExpression)
    }

    if (testWorkersCount > 1) {
      cucumberArgs.push('--parallel', testWorkersCount.toString())
    }

    const spawnedProcess = await spawnTask('npx', cucumberArgs, {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: `test-run-${testRunId}`,
      captureOutput: true,
    })

    processManager.register(testRunId, spawnedProcess)
    spawnedProcess.process.on('exit', () => {
      processManager.unregister(testRunId)
    })

    return {
      process: spawnedProcess,
      reportPath,
    }
  }

  waitForProcess(processName: string): Promise<number | null> {
    return waitForTask(processName)
  }

  killProcess(processName: string, signal?: NodeJS.Signals): boolean {
    return killTask(processName, signal)
  }

  getProcess(processName: string): SpawnedProcess | undefined {
    return taskSpawner.getProcess(processName)
  }

  spawnTraceViewer(testCaseId: string, tracePath: string): Promise<SpawnedProcess> {
    return taskSpawner.spawn('npx', ['playwright', 'show-trace', tracePath], {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: `trace-viewer-${testCaseId}`,
      captureOutput: false,
    })
  }
}

export const localExecutorAdapter = new LocalExecutorAdapter()
