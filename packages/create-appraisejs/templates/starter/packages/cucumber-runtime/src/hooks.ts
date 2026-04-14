import { After, AfterAll, AfterStep, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber'
import { config } from 'dotenv'
import { promises as fs } from 'fs'
import { chromium, firefox, webkit, ChromiumBrowser, FirefoxBrowser, WebKitBrowser } from 'playwright'
import { getAutomationScreenshotDir, getAutomationTraceDir, toProjectRelativePath } from './paths.js'
import { BrowserName } from './types.js'
import { CustomWorld } from './world.js'

config()

const SCREENSHOT_ATTACHMENT_MEDIA_TYPE = 'application/vnd.appraisejs.report-step-screenshot+json'
let browser: ChromiumBrowser | FirefoxBrowser | WebKitBrowser
let currentScenarioStatus = 'unknown'

BeforeAll(async function () {
  setDefaultTimeout(60000)
  const browserName = (process.env.BROWSER as BrowserName) || 'chromium'

  switch (browserName) {
    case 'chromium':
      browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' })
      break
    case 'firefox':
      browser = await firefox.launch({ headless: process.env.HEADLESS === 'true' })
      break
    case 'webkit':
      browser = await webkit.launch({ headless: process.env.HEADLESS === 'true' })
      break
    default:
      throw new Error(`Invalid browser name: ${browserName}`)
  }
})

Before(async function (this: CustomWorld) {
  this.clearVars()
  this.context = await browser.newContext()
  await this.context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  })
  this.page = await this.context.newPage()
})

AfterStep(async function (this: CustomWorld, result) {
  const status = result.result?.status
  if (status === 'FAILED') {
    currentScenarioStatus = 'failed'

    if (result.pickleStep?.text) {
      try {
        const screenshotDir = getAutomationScreenshotDir()
        await fs.mkdir(screenshotDir, { recursive: true })

        const screenshotPath = `${screenshotDir}/${crypto.randomUUID()}.png`
        await this.page.screenshot({ path: screenshotPath, fullPage: true })
        await this.attach(
          JSON.stringify({ screenshotPath: toProjectRelativePath(screenshotPath) }),
          SCREENSHOT_ATTACHMENT_MEDIA_TYPE,
        )
      } catch (error) {
        console.warn(
          `[CucumberRuntime] Failed to capture screenshot for step "${result.pickleStep.text}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }
  } else if (status === 'SKIPPED' && currentScenarioStatus !== 'failed') {
    currentScenarioStatus = 'skipped'
  } else if (status === 'PASSED' && currentScenarioStatus === 'unknown') {
    currentScenarioStatus = 'passed'
  }
})

After(async function (this: CustomWorld, scenario) {
  let tracePath: string | undefined
  if (scenario.result?.status === 'FAILED') {
    const traceDir = getAutomationTraceDir()
    await fs.mkdir(traceDir, { recursive: true })
    const absoluteTracePath = `${traceDir}/${crypto.randomUUID()}.zip`
    tracePath = toProjectRelativePath(absoluteTracePath)
    await this.context.tracing.stop({ path: absoluteTracePath })
  }

  const eventJson = JSON.stringify({
    event: 'scenario::end',
    data: {
      featureName: scenario.gherkinDocument?.feature?.name,
      scenarioName: scenario.pickle.name,
      scenarioTags: scenario.pickle.tags?.map(tag => tag.name) ?? [],
      status: currentScenarioStatus,
      tracePath,
    },
  })

  console.log(eventJson)
  process.stdout.write(eventJson + '\n')

  currentScenarioStatus = 'unknown'

  await this.page.close()
  await this.context.close()
})

AfterAll(async function () {
  await browser.close()
})
