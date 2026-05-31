import { Command, Option, OptionValues } from 'commander'
import parseTagExpression from '@cucumber/tag-expressions'
import { getAllEnvironments } from './environment.util.js'
import { BrowserName } from './types.js'

export interface CliOptions extends OptionValues {
  environment: string
  tags: string
  parallel: number
  browser: BrowserName
  headless: 'true' | 'false'
}

const BROWSER_CHOICES = ['chromium', 'firefox', 'webkit'] as const
const HEADLESS_CHOICES = ['true', 'false'] as const
const DEFAULT_PARALLEL_WORKERS = 1
const DEFAULT_BROWSER: BrowserName = 'chromium'
const DEFAULT_HEADLESS = 'true'

const program = new Command()

let environmentNames: string[] = []
try {
  environmentNames = Object.keys(getAllEnvironments())
} catch (error) {
  console.error('Failed to load environments:', error instanceof Error ? error.message : 'Unknown error')
  process.exit(1)
}

function parsePositiveInt(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--parallel must be a positive integer, got "${value}"`)
  }
  return parsed
}

function validateCucumberTagExpression(value: string): string {
  try {
    parseTagExpression(value)
    return value
  } catch (error) {
    throw new Error(`Invalid tag expression: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

program
  .name('cucumber-runtime')
  .description('CLI for running Appraise cucumber automation')
  .version('1.0.0')
  .addOption(
    new Option('-e, --environment <environment>', 'The environment to run the tests on')
      .choices(environmentNames)
      .makeOptionMandatory(),
  )
  .addOption(
    new Option('-t, --tags <tags>', 'The tags to run the tests on')
      .argParser(validateCucumberTagExpression)
      .makeOptionMandatory(),
  )
  .option(
    '-p, --parallel <parallel>',
    'The number of parallel workers to run',
    parsePositiveInt,
    DEFAULT_PARALLEL_WORKERS,
  )
  .addOption(
    new Option('-b, --browser <browser>', 'The browser to run').choices(BROWSER_CHOICES).default(DEFAULT_BROWSER),
  )
  .addOption(
    new Option('--headless <headless>', 'Whether to run headless').choices(HEADLESS_CHOICES).default(DEFAULT_HEADLESS),
  )

export function startCli(): CliOptions {
  program.parse()
  return program.opts() as CliOptions
}
