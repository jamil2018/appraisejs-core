import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name store
 * @description Generated human projections for canonical store operations
 * @type ACTION
 */

/**
 * @name store element text
 * @description Store an element's text content inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.store.store.element.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
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
    await executeHumanOperation(
      'browser.store.store.text.input.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
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
    await executeHumanOperation(
      'browser.store.store.textarea.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
