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
  runLocatorTemplateOperation,
  runPageTemplateOperation,
} from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name element state assertion
 * @description Visibility, attachment, enabled, editable, checked, focused, and empty element assertions
 * @type VALIDATION
 */

/**
 * @name assert element attached
 * @description Assert whether an element is attached to the DOM
 * @icon VALIDATION
 */
Then(
  'the {string} element attached status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect((await this.page.locator(selector).count()) > 0).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isEnabled()).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isEditable()).to.equal(expected)
  },
)

/**
 * @name assert element checked
 * @description Assert whether a checkbox or radio control is checked
 * @icon VALIDATION
 */
Then(
  'the {string} element checked status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isChecked()).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const focused = await this.page.locator(selector).evaluate(element => element === document.activeElement)
    expect(focused).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const value = await this.page.locator(selector).evaluate(element => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value
      }
      return element.textContent ?? ''
    })
    expect(value.length === 0).to.equal(expected)
  },
)
