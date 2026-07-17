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
 * @name input
 * @description Template steps that deal with inputs
 * @type ACTION
 */

/**
 * @name check
 * @description Template step for checking a checkbox
 * @icon INPUT
 */
When('the user checks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).check()
  } catch (error) {
    throw new Error(`Failed to check the ${elementName} checkbox: ${error}`)
  }
})

/**
 * @name clear
 * @description Template step for clearing an input field
 * @icon INPUT
 */
When('the user clears the {string} field', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).clear()
  } catch (error) {
    throw new Error(`Failed to clear the ${elementName} field: ${error}`)
  }
})

/**
 * @name fill
 * @description Template step for filling up an input field with a provided value
 * @icon INPUT
 */
When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }
    try {
      await this.page.locator(selector).fill(value)
    } catch (error) {
      throw new Error(`Failed to fill in the ${elementName} input field with value ${value}: ${error}`)
    }
  },
)

/**
 * @name fill input with stored value
 * @description Template step for filling an input field with data from a stored variable
 * @icon INPUT
 */
When(
  'the user fills in the {string} input with data from the stored variable {string}',
  async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
    const value = this.getVar<string>(variableName)
    const selector = await resolveLocator(this.page, fieldName)
    if (!selector) {
      throw new Error(`Selector ${fieldName} not found`)
    }
    try {
      await this.page.locator(selector).fill(value)
    } catch (error) {
      throw new Error(
        `Failed to fill in the ${fieldName} input field with data from the stored variable ${variableName}: ${error}`,
      )
    }
  },
)

/**
 * @name select dropdown option
 * @description Template step for selecting a particular option inside a dropdown element
 * @icon INPUT
 */
When(
  'the user selects the {string} option of the {string} dropdown',
  async function (this: CustomWorld, optionName: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }
    try {
      await this.page.locator(selector).selectOption(optionName)
    } catch (error) {
      throw new Error(`Failed to select the ${optionName} option of the ${elementName} dropdown: ${error}`)
    }
  },
)

/**
 * @name uncheck
 * @description Template step for unchecking a checkbox
 * @icon INPUT
 */
When('the user unchecks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).uncheck()
  } catch (error) {
    throw new Error(`Failed to uncheck the ${elementName} checkbox: ${error}`)
  }
})
