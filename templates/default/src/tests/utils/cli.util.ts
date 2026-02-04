import { Command, Option, OptionValues } from 'commander'
import { getAllEnvironments } from './environment.util.js'
import parseTagExpression from '@cucumber/tag-expressions'

/**
 * Configuration options for the CLI tool
 * @extends OptionValues - Extends Commander.js OptionValues for CLI integration
 */
export interface CliOptions extends OptionValues {
  /** The target environment to run tests against */
  environment: string
  /** Cucumber tag expression to filter test scenarios */
  tags: string
  /** Number of parallel workers to run tests with */
  parallel: number
  /** Browser engine to use for test execution */
  browser: 'chromium' | 'firefox' | 'webkit'
  /** Whether to run browser in headless mode */
  headless: 'true' | 'false'
}

/** Available browser choices for test execution */
const BROWSER_CHOICES = ['chromium', 'firefox', 'webkit'] as const

/** Available headless mode choices */
const HEADLESS_CHOICES = ['true', 'false'] as const

/** Default number of parallel workers */
const DEFAULT_PARALLEL_WORKERS = 1

/** Default browser engine */
const DEFAULT_BROWSER = 'chromium'

/** Default headless mode setting */
const DEFAULT_HEADLESS = 'true'

/**
 * Commander.js program instance for CLI argument parsing
 * Configured with all available options and validation rules
 */
const program = new Command()

/**
 * Available environment names loaded from configuration
 * Used to validate the --environment option
 */
let environmentNames: string[] = []
try {
  environmentNames = Object.keys(getAllEnvironments())
  if (environmentNames.length === 0) {
    console.warn('⚠️  No environments found in configuration')
  }
} catch (error) {
  console.error('❌ Failed to load environments:', error instanceof Error ? error.message : 'Unknown error')
  process.exit(1)
}

/**
 * Validates and parses a positive integer value from command line input
 *
 * Used as a custom parser for the --parallel option to ensure only valid
 * positive integers are accepted.
 *
 * @param val - The string value to parse from command line
 * @returns The parsed positive integer
 * @throws Error if the value is not a valid positive integer
 *
 * @example
 * ```typescript
 * parsePositiveInt("4") // Returns 4
 * parsePositiveInt("0") // Throws Error
 * parsePositiveInt("abc") // Throws Error
 * ```
 */
function parsePositiveInt(val: string): number {
  const n = Number(val)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--parallel must be a positive integer, got "${val}"`)
  }
  return n
}

/**
 * Validates a Cucumber tag expression for proper syntax
 *
 * Uses the @cucumber/tag-expressions library to validate that the provided
 * tag expression follows Cucumber's tag expression syntax rules.
 *
 * @param val - The tag expression string to validate
 * @returns The validated tag expression (unchanged if valid)
 * @throws Error if the tag expression is invalid
 *
 * @example
 * ```typescript
 * validateCucumberTagExpression('@smoke') // Returns '@smoke'
 * validateCucumberTagExpression('@smoke and @regression') // Returns '@smoke and @regression'
 * validateCucumberTagExpression('invalid expression') // Throws Error
 * ```
 */
function validateCucumberTagExpression(val: string): string {
  try {
    parseTagExpression(val)
    return val
  } catch (error) {
    throw new Error(`Invalid tag expression: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Configure the Commander.js CLI program with all available options
 *
 * Sets up the command name, description, version, and all command line options
 * with their respective validation rules and default values.
 */
program
  .name('cucumber-cli')
  .description('A CLI tool for running Cucumber tests with different configurations')
  .version('1.0.0')
  .addOption(
    new Option('-e, --environment <environment>', 'The environment to run the tests on')
      .choices(environmentNames)
      .makeOptionMandatory(),
  )
  .addOption(
    new Option('-t, --tags <tags>', 'The tags to run the tests on (Cucumber tag expression)')
      .argParser(validateCucumberTagExpression)
      .makeOptionMandatory(),
  )
  .option(
    '-p, --parallel <parallel>',
    'The number of parallel workers to run the tests on',
    parsePositiveInt,
    DEFAULT_PARALLEL_WORKERS,
  )
  .addOption(
    new Option('-b, --browser <browser>', 'The browser to run the tests on')
      .choices(BROWSER_CHOICES)
      .default(DEFAULT_BROWSER),
  )
  .addOption(
    new Option('-h, --headless <headless>', 'The headless mode to run the tests on')
      .choices(HEADLESS_CHOICES)
      .default(DEFAULT_HEADLESS),
  )

/**
 * Starts the CLI and parses command line arguments
 *
 * This is the main entry point for the CLI tool. It parses command line arguments,
 * validates them according to the configured rules, and returns the parsed options.
 * The function handles errors gracefully and exits the process with appropriate
 * error codes if parsing fails.
 *
 * @returns The parsed and validated CLI options
 * @throws Error if parsing fails or required options are missing
 *
 * @example
 * ```typescript
 * const options = startCli();
 * console.log(`Running tests on ${options.environment} with ${options.parallel} workers`);
 * ```
 */
export function startCli(): CliOptions {
  try {
    program.parse()
    const options = program.opts() as CliOptions

    return options
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ CLI Error:', error.message)
    } else {
      console.error('❌ CLI Error: Unknown error occurred')
    }
    process.exit(1)
  }
}
