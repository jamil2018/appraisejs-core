/**
 * @name store
 * @description Template steps that handle data storage
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name store element text
 * @description Template step for storing element text inside a data variable to be referenced in later steps
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, storeVariableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }
    try {
      const text = await this.page.locator(selector).textContent()
      this.setVar(storeVariableName, text)
    } catch (error) {
      throw new Error(`Failed to store the ${elementName} element text: ${error}`)
    }
  },
)

/**
 * @name store text input text
 * @description Template step for storing text input element values inside a variable
 * @icon STORE
 */
When(
  'the user stores the {string} text input value inside the variable {string}',
  async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, fieldName)
    if (!selector) {
      throw new Error(`Selector ${fieldName} not found`)
    }
    try {
      const value = await this.page.locator(selector).inputValue()
      this.setVar(variableName, value)
    } catch (error) {
      throw new Error(`Failed to store the ${fieldName} text input value: ${error}`)
    }
  },
)
