/**
 * @name text validation
 * @description Template steps that handles text validation
 * @type VALIDATION
 */
import { Then, When } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name Text Validation
 * @description Template step that handles validating the text of an element
 * @icon VALIDATION
 */
Then(
  'the {string} element should contain the text {string}',
  async function (this: CustomWorld, element: SelectorName, elementText: string) {
    try {
      const locator = await resolveLocator(this.page, element)
      if (!locator) {
        throw new Error(`Locator ${element} not found`)
      }
      const actualText = await this.page.locator(locator).textContent()
      if (!actualText) {
        throw new Error(`Element ${element} does not have any text`)
      }
      expect(actualText).to.equal(elementText)
    } catch (error) {
      console.error(error)
      throw error
    }
  },
)
