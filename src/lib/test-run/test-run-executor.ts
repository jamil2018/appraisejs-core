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

  console.log(`[TestRunExecutor] Starting to spawn process for testRunId: ${testRunId}`)
  console.log(`[TestRunExecutor] Command: npx cucumber-js ${cucumberArgs.join(' ')}`)
  
  // Spawn the cucumber test process
  // Enable streamLogs to see output in console for debugging
  // Use captureOutput: true to capture logs for streaming
  const process = await spawnTask('npx', ['cucumber-js', ...cucumberArgs], {
    streamLogs: true, // Enable console output to verify logs are being generated
    prefixLogs: true, // Add prefix to identify logs
    logPrefix: `test-run-${testRunId}`,
    captureOutput: true, // Capture output for streaming
  })

  console.log(`[TestRunExecutor] Process spawned successfully. Process name: ${process.name}, isRunning: ${process.isRunning}, PID: ${process.process.pid}`)

  // Register the process in ProcessManager
  processManager.register(testRunId, process)
  console.log(`[TestRunExecutor] Process registered in ProcessManager for testRunId: ${testRunId}`)

  // Set up stdout/stderr listeners to log when data is received
  process.process.stdout?.on('data', (data: Buffer) => {
    console.log(`[TestRunExecutor] Received stdout data for testRunId: ${testRunId}, length: ${data.length} bytes`)
  })

  process.process.stderr?.on('data', (data: Buffer) => {
    console.log(`[TestRunExecutor] Received stderr data for testRunId: ${testRunId}, length: ${data.length} bytes`)
  })

  // Set up exit handler - Log captured output and keep process in ProcessManager
  process.process.on('exit', (code) => {
    console.log(`[TestRunExecutor] Process exited with code: ${code} for testRunId: ${testRunId}`)
    
    // ROOT LEVEL LOG: Log all captured output when process exits
    console.log(`\n[ROOT VERIFY] ========== FINAL CAPTURED OUTPUT FOR ${testRunId} ==========`)
    console.log(`[ROOT VERIFY] stdout lines: ${process.output.stdout.length}, stderr lines: ${process.output.stderr.length}`)
    
    if (process.output.stdout.length > 0) {
      console.log(`\n[ROOT VERIFY] ========== STDOUT OUTPUT ==========`)
      process.output.stdout.forEach((line, index) => {
        console.log(`[ROOT VERIFY] stdout[${index}]:`, line.trim())
      })
    }
    
    if (process.output.stderr.length > 0) {
      console.log(`\n[ROOT VERIFY] ========== STDERR OUTPUT ==========`)
      process.output.stderr.forEach((line, index) => {
        console.log(`[ROOT VERIFY] stderr[${index}]:`, line.trim())
      })
    }
    console.log(`[ROOT VERIFY] ========== END CAPTURED OUTPUT ==========\n`)
    
    // Keep process in ProcessManager so SSE endpoint can access captured logs
    // Don't unregister immediately - SSE endpoint needs access to completed processes
    // Unregister after a delay to allow SSE connections to retrieve logs
    setTimeout(() => {
      console.log(`[TestRunExecutor] Cleaning up process from ProcessManager for testRunId: ${testRunId} after delay`)
      processManager.unregister(testRunId)
    }, 300000) // Keep for 5 minutes to allow log retrieval
  })

  return process
}

