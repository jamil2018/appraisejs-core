import {
  When,
  Then,
  CustomWorld,
  expect,
  SelectorName,
  resolveLocator,
  getEnvironment,
  generateRandomData,
  RandomDataType,
} from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name store
 * @description Template step group for storing runtime values
 * @type ACTION
 */

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name store element text
 * @description Store an element's text content inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      const value = await this.page.locator(selector).textContent()
      this.setVar(variableName, value ?? '')
    } catch (error) {
      throw new Error(`Failed to store the ${elementName} element text inside the variable ${variableName}: ${error}`)
    }
  },
)

/**
 * @name store text input text
 * @description Store a text input value inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} text input value inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      const value = await this.page.locator(selector).inputValue()
      this.setVar(variableName, value)
    } catch (error) {
      throw new Error(
        `Failed to store the ${elementName} text input value inside the variable ${variableName}: ${error}`,
      )
    }
  },
)

/**
 * @name store textarea text
 * @description Store a textarea value inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} textarea input value inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      const value = await this.page.locator(selector).inputValue()
      this.setVar(variableName, value)
    } catch (error) {
      throw new Error(
        `Failed to store the ${elementName} textarea input value inside the variable ${variableName}: ${error}`,
      )
    }
  },
)
