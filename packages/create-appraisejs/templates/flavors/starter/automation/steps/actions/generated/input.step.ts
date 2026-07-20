import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name input
 * @description Generated human projections for canonical input operations
 * @type ACTION
 */

/**
 * @name Fill field
 * @description Replace a field value through a resolved locator.
 * @icon INPUT
 */
When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, target: SelectorName, value: string) {
    await executeHumanOperation('browser.forms.fill@1', this, ['target', 'value'], [target, value])
  },
)

/**
 * @name check
 * @description Template step for checking a checkbox
 * @icon INPUT
 */
When('the user checks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.check@1', this, ['elementName'], [elementName])
})

/**
 * @name clear
 * @description Template step for clearing an input field
 * @icon INPUT
 */
When('the user clears the {string} field', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.clear@1', this, ['elementName'], [elementName])
})

/**
 * @name fill input with stored value
 * @description Template step for filling an input field with data from a stored variable
 * @icon INPUT
 */
When(
  'the user fills in the {string} input with data from the stored variable {string}',
  async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.input.fill.input.with.stored.value@1',
      this,
      ['fieldName', 'variableName'],
      [fieldName, variableName],
    )
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
    await executeHumanOperation(
      'browser.input.select.dropdown.option@1',
      this,
      ['optionName', 'elementName'],
      [optionName, elementName],
    )
  },
)

/**
 * @name uncheck
 * @description Template step for unchecking a checkbox
 * @icon INPUT
 */
When('the user unchecks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.uncheck@1', this, ['elementName'], [elementName])
})
