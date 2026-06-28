import { dirname } from 'path'
import { spawnTask, taskSpawner, type SpawnedProcess, waitForTask, killTask } from '@/lib/process/task-spawner'
import {
  buildJsonReportFormat,
  getAutomationRunReportPath,
  toProjectRelativePath,
} from '@/lib/automation/automation-path-roots'
import { ensureAutomationWorkspaceReady } from '@/lib/automation/automation-workspace'
import type { ExecutorAdapter, TestRunExecutionRequest, TestRunExecutionResult } from './types'
import { processManager } from '@/lib/test-run/process-manager'
import { promises as fs } from 'fs'

function mapBrowserEngineToName(
  browserEngine: TestRunExecutionRequest['browserEngine'],
): 'chromium' | 'firefox' | 'webkit' {
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

function generateReportPath(testRunId: string, projectRoot?: string): string {
  return getAutomationRunReportPath(testRunId, projectRoot)
}

class LocalExecutorAdapter implements ExecutorAdapter {
  async executeTestRun(config: TestRunExecutionRequest): Promise<TestRunExecutionResult> {
    const projectRoot = config.projectRoot
    if (config.prepareWorkspace !== false) {
      await ensureAutomationWorkspaceReady()
    }

    const { testRunId, environment, tagExpression, testWorkersCount, browserEngine, headless = true } = config
    const reportPath = generateReportPath(testRunId, projectRoot)
    const browserName = mapBrowserEngineToName(browserEngine)
    await fs.mkdir(dirname(reportPath), { recursive: true })
    const childEnv = {
      ...process.env,
      ENVIRONMENT: environment.name,
      HEADLESS: headless.toString(),
      BROWSER: browserName,
      REPORT_PATH: reportPath,
      REPORT_FORMAT: buildJsonReportFormat(reportPath, projectRoot),
      TEST_RUN_ID: testRunId,
    }

    const cucumberArgs: string[] = ['cucumber-js']

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
      env: childEnv,
      ...(projectRoot ? { cwd: projectRoot } : {}),
    })

    processManager.register(testRunId, spawnedProcess)
    spawnedProcess.process.on('exit', () => {
      processManager.unregister(testRunId)
    })

    return {
      process: spawnedProcess,
      reportPath: toProjectRelativePath(reportPath, projectRoot),
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
