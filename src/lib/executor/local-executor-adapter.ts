import { dirname } from 'path'
import path from 'path'
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

function quoteConfigPath(filePath: string) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "\\'")
}

function normalizeConfigPath(filePath: string, projectRoot?: string) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot ?? process.cwd(), filePath)
  const relativePath = path.relative(projectRoot ?? process.cwd(), absolutePath)
  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) return quoteConfigPath(relativePath)
  return quoteConfigPath(absolutePath)
}

async function writeExactCucumberConfig(input: {
  testRunId: string
  configDirectory: string
  projectRoot?: string
  featurePaths: string[]
  importPaths: string[]
  supportPaths?: string[]
}) {
  await fs.mkdir(input.configDirectory, { recursive: true })
  const configPath = path.join(input.configDirectory, `cucumber.${input.testRunId}.mjs`)
  const imports = [...input.importPaths, ...(input.supportPaths ?? [])]
  const content = [
    '// Generated for an Appraise plan-bound run. Do not edit by hand.',
    'export default {',
    `  paths: ${JSON.stringify(input.featurePaths.map(filePath => normalizeConfigPath(filePath, input.projectRoot)))},`,
    `  import: ${JSON.stringify(imports.map(filePath => normalizeConfigPath(filePath, input.projectRoot)))},`,
    "  loader: ['ts-node/esm'],",
    '  format: [',
    "    'pretty',",
    "    process.env.REPORT_FORMAT ?? `json:${process.env.REPORT_PATH ?? 'automation/reports/cucumber.json'}`,",
    '  ],',
    '  publishQuiet: true,',
    '}',
    '',
  ].join('\n')
  await fs.writeFile(configPath, content)
  return configPath
}

async function buildCucumberArgs(config: TestRunExecutionRequest, reportPath: string, projectRoot?: string) {
  const cucumberArgs: string[] = ['cucumber-js']

  if (config.featurePaths?.length || config.importPaths?.length) {
    const configPath = await writeExactCucumberConfig({
      testRunId: config.testRunId,
      configDirectory: dirname(reportPath),
      projectRoot,
      featurePaths: config.featurePaths ?? [],
      importPaths: config.importPaths ?? [],
      supportPaths: config.supportPaths,
    })
    cucumberArgs.push('--config', normalizeConfigPath(configPath, projectRoot))
  }

  if (config.tagExpression) cucumberArgs.push('-t', config.tagExpression)
  if (config.testWorkersCount > 1) cucumberArgs.push('--parallel', config.testWorkersCount.toString())
  return cucumberArgs
}

class LocalExecutorAdapter implements ExecutorAdapter {
  async executeTestRun(config: TestRunExecutionRequest): Promise<TestRunExecutionResult> {
    const projectRoot = config.projectRoot
    if (config.prepareWorkspace !== false) {
      await ensureAutomationWorkspaceReady()
    }

    const { testRunId, environment, browserEngine, headless = true } = config
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

    const cucumberArgs = await buildCucumberArgs(config, reportPath, projectRoot)

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
