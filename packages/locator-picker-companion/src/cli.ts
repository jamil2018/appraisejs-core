import { chromium, type BrowserContext, type ElementHandle, type Page } from 'playwright'
import path from 'path'
import {
  ensureLocatorPickerDirectories,
  patchLocatorPickerSessionFile,
  readLocatorPickerSessionFile,
  writeLocatorPickerSessionFile,
} from './session-file.js'
import { generatePickedLocatorPayload } from './selector-generator.js'
import { installLocatorPickerOverlay } from './injected-picker-script.js'
import type { CompanionPickedLocatorPayload } from './types.js'

interface CliOptions {
  sessionId: string
  sessionFile: string
  targetUrl: string
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    values.set(token, argv[index + 1] ?? '')
    index += 1
  }

  const sessionId = values.get('--session-id')?.trim()
  const sessionFile = values.get('--session-file')?.trim()
  const targetUrl = values.get('--target-url')?.trim()

  if (!sessionId || !sessionFile || !targetUrl) {
    throw new Error('Missing required arguments: --session-id, --session-file, --target-url.')
  }

  return {
    sessionId,
    sessionFile,
    targetUrl,
  }
}

function normalizeRoute(value: string): string {
  if (!value) {
    return '/'
  }

  try {
    return new URL(value).pathname || '/'
  } catch {
    return value.startsWith('/') ? value : `/${value}`
  }
}

class LocatorPickerCompanion {
  private readonly sessionFile: string

  private readonly targetUrl: string

  private context: BrowserContext | null = null

  private finalized = false

  private shuttingDown = false

  private requestedExitCode = 0

  constructor(options: CliOptions) {
    this.sessionFile = options.sessionFile
    this.targetUrl = options.targetUrl
  }

  get exitCode(): number {
    return this.requestedExitCode
  }

  private async ensureOverlayInstalled(page: Page): Promise<void> {
    if (page.isClosed()) {
      return
    }

    await page.evaluate(installLocatorPickerOverlay).catch(() => undefined)
  }

  async run(): Promise<void> {
    await ensureLocatorPickerDirectories(process.cwd())

    await patchLocatorPickerSessionFile(this.sessionFile, {
      companionPid: process.pid,
      error: undefined,
    })

    process.on('SIGTERM', () => {
      void this.shutdown('closed')
    })

    process.on('SIGINT', () => {
      void this.shutdown('closed')
    })

    const profileDir = path.join(process.cwd(), '.tmp', 'locator-picker', 'profiles', path.basename(this.sessionFile, '.json'))

    try {
      this.context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        channel: 'chromium',
        ignoreHTTPSErrors: true,
      })

      await this.context.exposeBinding(
        '__appraiseLocatorPickerPreview',
        async ({ page }, elementHandle) => {
          return this.generatePreview(page, elementHandle as ElementHandle)
        },
        { handle: true },
      )

      await this.context.exposeBinding('__appraiseLocatorPickerConfirm', async (_source, payload) => {
        await this.confirmSelection(payload as CompanionPickedLocatorPayload)
      })

      await this.context.exposeBinding('__appraiseLocatorPickerCancel', async () => {
        await this.shutdown('closed')
      })

      await this.context.addInitScript(installLocatorPickerOverlay)
      this.context.on('page', page => {
        this.attachPage(page)
      })

      for (const page of this.context.pages()) {
        this.attachPage(page)
      }

      const page = this.context.pages().find(candidate => !candidate.isClosed()) ?? (await this.context.newPage())
      await page.goto(this.targetUrl, { waitUntil: 'domcontentloaded' })
      await this.ensureOverlayInstalled(page)
      await this.writePageState(page, 'ready')

      await this.context.waitForEvent('close', { timeout: 0 })
      if (!this.finalized) {
        await this.shutdown('closed')
      }
    } catch (error) {
      this.requestedExitCode = 1
      await this.markError(
        error instanceof Error && error.message.includes("Executable doesn't exist")
          ? 'Playwright Chromium is not installed. Run `npm run install-playwright -- chromium` and retry.'
          : error instanceof Error
            ? error.message
            : 'Failed to start the locator picker companion.',
      )
      process.exitCode = 1
    }
  }

  private attachPage(page: Page): void {
    const refresh = () => {
      void (async () => {
        await this.ensureOverlayInstalled(page)
        await this.writePageState(page, this.finalized ? 'picked' : 'ready')
      })()
    }

    page.on('domcontentloaded', refresh)
    page.on('load', refresh)
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        refresh()
      }
    })
    page.on('close', () => {
      void this.handlePageClose()
    })
  }

  private async writePageState(page: Page, status: 'ready' | 'picked'): Promise<void> {
    if (page.isClosed()) {
      return
    }

    const currentUrl = page.url()
    const pageTitle = await page.title().catch(() => '')

    await patchLocatorPickerSessionFile(this.sessionFile, current => ({
      status: current.status === 'saving' ? 'saving' : status,
      currentUrl,
      currentPathname: normalizeRoute(currentUrl),
      pageTitle,
      companionPid: process.pid,
      error: undefined,
    }))
  }

  private async generatePreview(
    page: Page | undefined,
    elementHandle: ElementHandle,
  ): Promise<CompanionPickedLocatorPayload> {
    if (!page || page.isClosed()) {
      throw new Error('The page is no longer available for picking.')
    }

    return generatePickedLocatorPayload(page, elementHandle)
  }

  private async confirmSelection(payload: CompanionPickedLocatorPayload): Promise<void> {
    this.finalized = true
    this.requestedExitCode = 0

    await patchLocatorPickerSessionFile(this.sessionFile, current => ({
      status: current.status === 'saving' ? 'saving' : 'picked',
      currentUrl: payload.currentUrl,
      currentPathname: payload.pathname,
      pageTitle: payload.pageTitle,
      pickedLocator: payload,
      error: undefined,
      companionPid: process.pid,
    }))

    await this.closeContext()
  }

  private async handlePageClose(): Promise<void> {
    if (this.finalized || this.shuttingDown || !this.context) {
      return
    }

    const openPages = this.context.pages().filter(page => !page.isClosed())
    if (openPages.length === 0) {
      await this.shutdown('closed')
    }
  }

  private async closeContext(): Promise<void> {
    if (!this.context) {
      return
    }

    const currentContext = this.context
    this.context = null
    await currentContext.close().catch(() => undefined)
  }

  private async markError(message: string): Promise<void> {
    this.finalized = false
    this.requestedExitCode = 1
    await patchLocatorPickerSessionFile(this.sessionFile, {
      status: 'error',
      error: message,
      companionPid: process.pid,
    })
  }

  private async shutdown(status: 'closed' | 'error'): Promise<void> {
    if (this.shuttingDown) {
      return
    }

    this.shuttingDown = true
    this.requestedExitCode = status === 'error' ? 1 : 0

    if (!this.finalized) {
      await patchLocatorPickerSessionFile(this.sessionFile, current => ({
        status: current.status === 'saving' ? 'saving' : status,
        companionPid: process.pid,
      }))
    }

    await this.closeContext()
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const existingSession = await readLocatorPickerSessionFile(options.sessionFile)
  if (!existingSession) {
    throw new Error(`Locator picker session file not found: ${options.sessionFile}`)
  }

  await writeLocatorPickerSessionFile(options.sessionFile, {
    ...existingSession,
    companionPid: process.pid,
    error: undefined,
  })

  const companion = new LocatorPickerCompanion(options)
  await companion.run()
  process.exit(companion.exitCode)
}

void main().catch(async error => {
  const argv = process.argv.slice(2)
  const sessionFileIndex = argv.findIndex(token => token === '--session-file')
  const sessionFile = sessionFileIndex >= 0 ? argv[sessionFileIndex + 1] : undefined

  if (sessionFile) {
    await patchLocatorPickerSessionFile(sessionFile, {
      status: 'error',
      error: error instanceof Error ? error.message : 'Locator picker companion failed.',
      companionPid: process.pid,
    }).catch(() => undefined)
  }

  process.exitCode = 1
})
