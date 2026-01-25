/**
 * @name visibility
 * @description Template step for validating element visibility
 * @type VALIDATION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name validate element visibility
 * @description Template step for validating the visibility of an element
 * @icon VALIDATION
 */
When('the element {string} should be visible', async function (this: CustomWorld, elementName: SelectorName) {
  try {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const isVisible = await this.page.locator(selector).isVisible({ timeout: 10000 })
    expect(isVisible).to.be.true
  } catch (error) { throw new Error(`Failed to validate the visibility of the element ${elementName}: ${error}`) }
})
