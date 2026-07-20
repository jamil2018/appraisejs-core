import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name element state assertion
 * @description Generated human projections for canonical element state assertion operations
 * @type VALIDATION
 */

/**
 * @name Assert checked state
 * @description Assert the exact checked state of a form control.
 * @icon VALIDATION
 */
Then(
  'the {string} element checked status should be {boolean}',
  async function (this: CustomWorld, target: SelectorName, checked: boolean) {
    await executeHumanOperation('browser.assertions.checked@1', this, ['target', 'checked'], [target, checked])
  },
)

/**
 * @name assert element attached
 * @description Assert whether an element is attached to the DOM
 * @icon VALIDATION
 */
Then(
  'the {string} element attached status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.attached@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)

/**
 * @name assert element editable
 * @description Assert whether an input or content-editable element is editable
 * @icon VALIDATION
 */
Then(
  'the {string} element editable status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.editable@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)

/**
 * @name assert element empty
 * @description Assert whether an input value or element text is empty
 * @icon VALIDATION
 */
Then(
  'the {string} element empty status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.empty@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)

/**
 * @name assert element enabled
 * @description Assert whether an element is enabled for interaction
 * @icon VALIDATION
 */
Then(
  'the {string} element enabled status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.enabled@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)

/**
 * @name assert element focused
 * @description Assert whether an element currently has document focus
 * @icon VALIDATION
 */
Then(
  'the {string} element focused status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.focused@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
