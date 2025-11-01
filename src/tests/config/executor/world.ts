import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber'
import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { BrowserContext, Page } from 'playwright'
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
