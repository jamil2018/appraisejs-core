import { Then } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'

Then('the user should see {string} in {string}', async function (this: CustomWorld, text: string, selector: string) {
  const locator = this.page.locator(selector)
  const locatorTextContent = await locator.textContent()
  expect(locatorTextContent).to.contain(text)
})
