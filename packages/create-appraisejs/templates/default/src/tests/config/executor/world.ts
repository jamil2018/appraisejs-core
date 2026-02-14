import { World, IWorldOptions, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { BrowserContext, Page } from 'playwright'

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
}

setWorldConstructor(CustomWorld)

chai.use(chaiAsPromised)
export const expect = chai.expect
