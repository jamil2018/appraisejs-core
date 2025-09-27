import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/world.js'
import { Locator } from '../../types/step/step.type'
import { resolveLocator } from '../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

When('the user clicks on the {string} element', async function (this: CustomWorld, element_name: Locator) {
  try {
    // Resolve locator for the current page (waits for page load by default)
    const elementLocator = await resolveLocator(this.page, element_name)
    if (!elementLocator) {
      throw new Error(`Element ${element_name} not found`)
    }

    // Wait for element to be visible and click it
    await this.page.locator(elementLocator).waitFor({ state: 'visible' })

    // Click and wait for navigation to complete
    await Promise.all([this.page.waitForNavigation({ waitUntil: 'networkidle' }), this.page.click(elementLocator)])
  } catch (error) {
    console.error(error)
    throw new Error(`Error clicking on the ${element_name} element`)
  }
})
