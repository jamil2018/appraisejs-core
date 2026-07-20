import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name text assertion
 * @description Generated human projections for canonical text assertion operations
 * @type VALIDATION
 */

/**
 * @name assert element contains text
 * @description Template step for validating whether an element contains a certain text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} contain the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldContain: boolean, elementText: string) {
    await executeHumanOperation(
      'browser.assertions.text-contains@1',
      this,
      ['elementName', 'shouldContain', 'elementText'],
      [elementName, shouldContain, elementText],
    )
  },
)

/**
 * @name Assert text
 * @description Assert that a resolved target contains expected text.
 * @icon VALIDATION
 */
Then(
  'the {string} element should contain the text {string}',
  async function (this: CustomWorld, target: SelectorName, text: string) {
    await executeHumanOperation('browser.assertions.text@1', this, ['target', 'text'], [target, text])
  },
)

/**
 * @name assert element contains stored variable text
 * @description Template step to validate whether an element text contains the text inside a stored variable
 * @icon VALIDATION
 */
Then(
  'the element {string} should contain the text inside the stored variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.text.assertion.assert.element.contains.stored.variable.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)

/**
 * @name assert element equals text
 * @description Template step for validating whether an element text equals a provided text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} equal the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldEqual: boolean, elementText: string) {
    await executeHumanOperation(
      'browser.text.assertion.assert.element.equals.text@1',
      this,
      ['elementName', 'shouldEqual', 'elementText'],
      [elementName, shouldEqual, elementText],
    )
  },
)
