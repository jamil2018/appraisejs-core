import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { Browser, BrowserContext, Page } from 'playwright'

export type BrowserName = 'chromium' | 'firefox' | 'webkit'

export class CustomWorld extends World {
  browserName: BrowserName
  browser!: Browser
  context!: BrowserContext
  page!: Page

  constructor(options: IWorldOptions) {
    super(options)
    const param = (options.parameters as { browserName: BrowserName }) ?? {
      browserName: 'chromium',
    }
    this.browserName = param.browserName
  }
}

setWorldConstructor(CustomWorld)

chai.use(chaiAsPromised)
export const expect = chai.expect
