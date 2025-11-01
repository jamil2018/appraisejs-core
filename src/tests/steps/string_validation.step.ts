import { Then } from '@cucumber/cucumber'
import { CustomWorld } from '../config/executor/world.js'
import { Locator } from '../../types/step/step.type'
import { resolveLocator } from '../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

Then(
  'the {string} element should contain the text {string}',
  async function (this: CustomWorld, element_name: Locator, value: string) {
    try {
      // Resolve locator (now waits for page load by default)
      const elementLocator = await resolveLocator(this.page, element_name)
      if (!elementLocator) {
        throw new Error(`Element ${element_name} not found`)
      }

      // Wait for the element to be visible before validation
      await this.page.locator(elementLocator).waitFor({ state: 'visible', timeout: 10000 })

      const textContent = await this.page.textContent(elementLocator)
      if (textContent !== value) {
        throw new Error(`Element ${element_name} does not contain the text ${value}`)
      }
    } catch (error) {
      console.error(error)
      throw new Error(`Error validating the ${element_name} element with text ${value}`)
    }
  },
)
