/**
 * @name visibility assertion
 * @description Template steps that handles the assertion of element visibility states
 * @type VALIDATION
 */
import { Then } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name assert element visible
 * @description Template step for validating whether an element should be visible or not
 * @icon VALIDATION
 */
Then(
  'the visibility status of the {string} element should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, isVisible: boolean) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const elementVisibilityStatus = await this.page.locator(selector).isVisible({ timeout: 10000 })
      expect(elementVisibilityStatus).to.equal(isVisible)
    } catch (error) {
      throw new Error(`Failed to validate the visibility of the element ${elementName}: ${error}`)
    }
  },
)
