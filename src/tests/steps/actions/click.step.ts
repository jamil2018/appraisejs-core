/**
 * @name click
 * @description Template step for handling element click
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name click
 * @description Template step for clicking on an element
 * @icon MOUSE
 */
When('the user clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).click()
  } catch (error) {
    throw new Error(`Failed to click on the ${elementName} element: ${error}`)
  }
})

/**
 * @name double click
 * @description Template step for double clicking on an element
 * @icon MOUSE
 */
When('the user double clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).dblclick()
  } catch (error) {
    throw new Error(`Failed to double click on the ${elementName} element: ${error}`)
  }
})

/**
 * @name right click
 * @description Template step for right clicking on an element
 * @icon MOUSE
 */
When('the user right clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).click({ button: 'right' })
  } catch (error) {
    throw new Error(`Failed to right click on the ${elementName} element: ${error}`)
  }
})
