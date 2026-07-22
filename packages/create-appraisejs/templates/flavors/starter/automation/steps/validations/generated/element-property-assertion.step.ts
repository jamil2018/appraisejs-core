import {
  CustomWorld,
  SelectorName,
  Then,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name element property assertion
 * @description Generated human projections for canonical element property assertion operations
 * @type VALIDATION
 */

/**
 * @name Assert accessible
 * @description Assert that the resolved target exposes an accessible name and role.
 * @icon VALIDATION
 */
Then('the {string} element should have an accessible name', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.accessible@1', this, ['target'], [target])
})

/**
 * @name Assert field value
 * @description Assert the exact value of a form control.
 * @icon VALIDATION
 */
Then(
  'the {string} input value should equal {string}',
  async function (this: CustomWorld, target: SelectorName, value: string) {
    await executeHumanOperation('browser.assertions.value@1', this, ['target', 'value'], [target, value])
  },
)

/**
 * @name assert element attribute
 * @description Assert an element attribute exactly, using an empty string for a missing attribute
 * @icon VALIDATION
 */
Then(
  'the {string} element attribute {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, attribute: string, expected: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.attribute@1',
      this,
      ['elementName', 'attribute', 'expected'],
      [elementName, attribute, expected],
    )
  },
)

/**
 * @name assert element bounding box
 * @description Assert an element bounding-box x, y, width, and height using rounded pixels
 * @icon VALIDATION
 */
Then(
  'the {string} element bounding box should be x {int} y {int} width {int} height {int}',
  async function (this: CustomWorld, elementName: SelectorName, x: number, y: number, width: number, height: number) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.bounding.box@1',
      this,
      ['elementName', 'x', 'y', 'width', 'height'],
      [elementName, x, y, width, height],
    )
  },
)

/**
 * @name assert element class
 * @description Assert whether an element class list contains a class name
 * @icon VALIDATION
 */
Then(
  'the {string} element should {boolean} have class {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldHave: boolean, className: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.class@1',
      this,
      ['elementName', 'shouldHave', 'className'],
      [elementName, shouldHave, className],
    )
  },
)

/**
 * @name assert element count
 * @description Assert the number of elements matched by a locator
 * @icon VALIDATION
 */
Then(
  'the {string} locator should match {int} elements',
  async function (this: CustomWorld, elementName: SelectorName, expected: number) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.count@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)

/**
 * @name assert element css property
 * @description Assert a computed CSS property value for an element
 * @icon VALIDATION
 */
Then(
  'the {string} element css property {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, property: string, expected: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.css.property@1',
      this,
      ['elementName', 'property', 'expected'],
      [elementName, property, expected],
    )
  },
)
