import { World, IWorldOptions, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { BrowserContext, Page } from 'playwright'

setDefaultTimeout(120 * 1000)
export class CustomWorld extends World {
  context!: BrowserContext
  page!: Page

  constructor(options: IWorldOptions) {
    super(options)
  }
}

setWorldConstructor(CustomWorld)

chai.use(chaiAsPromised)
export const expect = chai.expect
