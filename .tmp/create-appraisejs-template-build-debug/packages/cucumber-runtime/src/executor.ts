import { execa } from 'execa'
import { config } from 'dotenv'
import { startCli } from './cli.js'

async function bootstrap(): Promise<void> {
  config()

  try {
    const { environment, tags, parallel, browser, headless } = startCli()

    process.env.ENVIRONMENT = environment
    process.env.HEADLESS = headless
    process.env.BROWSER = browser

    const cucumberArgs: string[] = ['cucumber-js', '-t', tags]
    if (parallel > 1) {
      cucumberArgs.push('--parallel', parallel.toString())
    }

    const subprocess = execa('npx', cucumberArgs, {
      stdio: 'inherit',
    })

    const result = await subprocess
    process.exit(result.exitCode ?? 0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}

bootstrap()
