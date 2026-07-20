import { World, IWorldOptions, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber'
import { BrowserContext, Page } from 'playwright'
import { BrowserRuntimeDiagnostics, type BrowserRuntimeIssue } from './browser-runtime-diagnostics.ts'
export { expect } from './assertion.ts'

setDefaultTimeout(120 * 1000)

export interface ScenarioData {
  token?: string
  vars: Record<string, unknown>
}

export class CustomWorld extends World {
  context!: BrowserContext
  page!: Page
  data: ScenarioData = {
    vars: {},
  }
  private browserRuntimeDiagnostics = new BrowserRuntimeDiagnostics()

  constructor(options: IWorldOptions) {
    super(options)
  }

  setVar(key: string, value: unknown): void {
    this.data.vars[key] = value
  }

  getVar<T = unknown>(key: string): T {
    if (!(key in this.data.vars)) {
      throw new Error(`Variable ${key} not found`)
    }

    return this.data.vars[key] as T
  }

  clearVars(): void {
    this.data.vars = {}
  }

  clearBrowserRuntimeIssues(): void {
    this.browserRuntimeDiagnostics.clear()
  }

  recordBrowserRuntimeIssue(issue: BrowserRuntimeIssue): void {
    this.browserRuntimeDiagnostics.record(issue)
  }

  browserRuntimeIssuesFor(source: BrowserRuntimeIssue['source'] | 'console-and-page'): BrowserRuntimeIssue[] {
    return this.browserRuntimeDiagnostics.read(source)
  }
}

setWorldConstructor(CustomWorld)
