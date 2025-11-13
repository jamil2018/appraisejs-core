import { BrowserEngine, Environment, Tag } from '@prisma/client'
import { spawnTask } from '@/tests/utils/spawner.util'
import { processManager } from './process-manager'
import type { SpawnedProcess } from '@/tests/utils/spawner.util'

/**
 * Configuration for executing a test run
 */
export interface TestRunExecutionConfig {
  testRunId: string
  environment: Environment
  tags: Tag[]
  testWorkersCount: number
  browserEngine: BrowserEngine
  headless?: boolean
}

/**
 * Maps BrowserEngine enum to browser name string for CLI
 */
function mapBrowserEngineToName(browserEngine: BrowserEngine): 'chromium' | 'firefox' | 'webkit' {
  switch (browserEngine) {
    case BrowserEngine.CHROMIUM:
      return 'chromium'
    case BrowserEngine.FIREFOX:
      return 'firefox'
    case BrowserEngine.WEBKIT:
      return 'webkit'
    default:
      return 'chromium'
  }
}

/**
 * Combines multiple tag expressions into a single Cucumber tag expression
 * Uses OR logic to combine tags: (@tag1 or @tag2 or @tag3)
 */
function combineTagExpressions(tags: Tag[]): string | null {
  if (tags.length === 0) {
    return null
  }

  if (tags.length === 1) {
    return tags[0].tagExpression
  }

  // Combine multiple tag expressions with OR
  return tags.map(tag => `(${tag.tagExpression})`).join(' or ')
}

/**
 * Sets environment variables for the test execution
 */
function setEnvironmentVariables(environment: Environment, headless: boolean, browser: string): void {
  process.env.ENVIRONMENT = environment.name
  process.env.HEADLESS = headless.toString()
  process.env.BROWSER = browser
}

/**
 * Executes a test run by spawning a cucumber process
 * 
 * @param config - Test run execution configuration
 * @returns Promise that resolves to the spawned process
 */
export async function executeTestRun(config: TestRunExecutionConfig): Promise<SpawnedProcess> {
  const { testRunId, environment, tags, testWorkersCount, browserEngine, headless = true } = config

  // Map browser engine to browser name
  const browserName = mapBrowserEngineToName(browserEngine)

  // Set environment variables
  setEnvironmentVariables(environment, headless, browserName)

  // Build cucumber command arguments
  const cucumberArgs: string[] = []

  // Add tag expression if tags are provided
  const tagExpression = combineTagExpressions(tags)
  if (tagExpression) {
    cucumberArgs.push('-t', tagExpression)
  }

  // Add parallel flag if workers > 1
  if (testWorkersCount > 1) {
    cucumberArgs.push('--parallel', testWorkersCount.toString())
  }

  // Spawn the cucumber test process
  // Enable streamLogs to see output in console for debugging
  // Use captureOutput: true to capture logs for streaming
  const process = await spawnTask('npx', ['cucumber-js', ...cucumberArgs], {
    streamLogs: true, // Enable console output to verify logs are being generated
    prefixLogs: true, // Add prefix to identify logs
    logPrefix: `test-run-${testRunId}`,
    captureOutput: true, // Capture output for streaming
  })

  // Register the process in ProcessManager
  processManager.register(testRunId, process)

  // Set up exit handler - Immediately unregister process to free up memory
  process.process.on('exit', (code) => {
    // Immediately unregister the process to free up memory
    // Log storage will be handled in createTestRunAction after process completion
    processManager.unregister(testRunId)
    console.log(`[TestRunExecutor] Process exited for testRunId: ${testRunId} with code ${code}, unregistered from ProcessManager`)
  })

  return process
}

