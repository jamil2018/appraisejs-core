/**
 * @name keyboard
 * @description Template steps that handles input actions
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name Fill in
 * @description Template step that handles filling in a field with a value
 * @icon INPUT
 */
When(
  'the user fills in the {string} field with value {string}',
  async function (this: CustomWorld, element: SelectorName, inputValue: string) {
    try {
      const locator = await resolveLocator(this.page, element)
      if (!locator) {
        throw new Error(`Locator ${element} not found`)
      }
      await this.page.locator(locator).fill(inputValue)
    } catch (error) {
      console.error(error)
      throw error
    }
  },
)
