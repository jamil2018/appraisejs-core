import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { resolveLocator } from '../../utils/locator.util'
import { SelectorName } from '@/types/locator/locator.type'

When('the user clicks on {string}', async function (this: CustomWorld, element: SelectorName) {
  try {
    const locator = resolveLocator(this.page, element)
    if (!locator) {
      throw new Error(`Locator ${element} not found`)
    }
    await this.page.click(locator, { timeout: 10000 })
  } catch (error) {
    console.error(error)
  }
})
