import { After, AfterAll, AfterStep, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber'
import { CustomWorld } from '../config/executor/world.js'
import { BrowserName } from '@/types/executor/browser.type'
import { config } from 'dotenv'
import { chromium, ChromiumBrowser, firefox, FirefoxBrowser, webkit, WebKitBrowser } from 'playwright'

// Load environment variables
config()

// Initialize browser
let browser: ChromiumBrowser | FirefoxBrowser | WebKitBrowser

// Track scenario status
let currentScenarioStatus: string = 'unknown'

BeforeAll(async function () {
  setDefaultTimeout(60000)
  const browserName = (process.env.BROWSER as BrowserName) || 'chromium'
  switch (browserName) {
    case 'chromium':
      browser = await chromium.launch({
        headless: process.env.HEADLESS === 'true',
      })
      break
    case 'firefox':
      browser = await firefox.launch({
        headless: process.env.HEADLESS === 'true',
      })
      break
    case 'webkit':
      browser = await webkit.launch({
        headless: process.env.HEADLESS === 'true',
      })
      break
    default:
      throw new Error(`Invalid browser name: ${browserName}`)
  }
})

Before(async function (this: CustomWorld) {
  this.context = await browser.newContext()
  await this.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  })
  this.page = await this.context.newPage()
})

AfterStep(async function (this: CustomWorld, result) {
  // Track the worst status encountered (failed > skipped > passed)
  const status = result.result?.status
  if (status === 'FAILED') {
    currentScenarioStatus = 'failed'
  } else if (status === 'SKIPPED' && currentScenarioStatus !== 'failed') {
    currentScenarioStatus = 'skipped'
  } else if (status === 'PASSED' && currentScenarioStatus === 'unknown') {
    currentScenarioStatus = 'passed'
  }
})

After(async function (this: CustomWorld, scenario) {
  // Emit scenario end event as JSON to stdout
  // ProcessManager will parse this and re-emit it as an event
  let tracePath: string | undefined
  if (scenario.result?.status === 'FAILED') {
    tracePath = `${process.cwd()}/src/tests/reports/traces/${crypto.randomUUID()}.zip`
    await this.context.tracing.stop({
      path: tracePath,
    })
  }

  const eventData = {
    event: 'scenario::end',
    data: {
      scenarioName: scenario.pickle.name,
      status: currentScenarioStatus,
      tracePath: tracePath,
    },
  }

  // Write to stdout in a parseable JSON format
  // Use process.stdout.write to ensure it's captured by TaskSpawner
  const eventJson = JSON.stringify(eventData)
  console.log(eventJson)
  // Also write directly to stdout to ensure it's captured
  process.stdout.write(eventJson + '\n')

  // Reset status for next scenario
  currentScenarioStatus = 'unknown'

  await this.page.close()
  await this.context.close()
})

AfterAll(async function () {
  await browser.close()
})
