import { BrowserName } from '@/types/executor/browser.type'
import { CliOptions, startCli } from '@/tests/utils/cli.util.js'
import { spawnTask, waitForTask } from '@/tests/utils/spawner.util.js'
import { config } from 'dotenv'

function setEnvironmentVariables(environment: string, headless: boolean, browser: BrowserName) {
  process.env.ENVIRONMENT = environment
  process.env.HEADLESS = headless.toString()
  process.env.BROWSER = browser
}

/**
 * Main entry point for the CLI application
 * Handles CLI parsing, error handling, and application lifecycle
 */
async function bootstrap(): Promise<void> {
  // Load environment variables
  config()

  try {
    // Parse CLI arguments and get options
    const { environment, tags, parallel, browser, headless }: CliOptions = startCli()

    // Log parsed options with better formatting
    console.log(
      `Running tests in the following configuration\nEnvironment: ${environment}\nTags: ${tags}\nParallel: ${parallel}\nBrowser: ${browser}\nHeadless: ${headless}`,
    )

    setEnvironmentVariables(environment, headless as unknown as boolean, browser as unknown as BrowserName)

    // Build the cucumber command with appropriate flags
    const cucumberArgs: string[] = []

    if (tags) {
      cucumberArgs.push('-t', tags)
    }

    if (parallel > 1) {
      cucumberArgs.push('--parallel', parallel.toString())
    }

    // Spawn the cucumber test process
    console.log('🚀 Starting cucumber test process...')
    await spawnTask('npx', ['cucumber-js', ...cucumberArgs], {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: 'cucumber-test',
      captureOutput: true,
    })

    // Wait for the test process to complete
    const exitCode = await waitForTask('cucumber-test')

    if (exitCode === 0) {
      console.log('✅ Tests completed successfully')
    } else {
      console.log(`❌ Tests failed with exit code: ${exitCode}`)
    }

    process.exit(exitCode || 0)
  } catch (error) {
    console.error('❌ Application failed with error:')
    console.error(error instanceof Error ? error.message : 'Unknown error occurred')
    process.exit(1)
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error.message)
  process.exit(1)
})

process.on('unhandledRejection', reason => {
  console.error('❌ Unhandled Rejection:', reason)
  process.exit(1)
})

// Start the application
bootstrap()
