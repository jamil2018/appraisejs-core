import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name element property assertion
 * @description Input value, attribute, class, CSS, count, and bounding-box assertions
 * @type VALIDATION
 */

/**
 * @name assert input value
 * @description Assert an input, textarea, or select value exactly
 * @icon VALIDATION
 */
Then(
  'the {string} input value should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expected: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).inputValue()).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect((await this.page.locator(selector).getAttribute(attribute)) ?? '').to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const classes = ((await this.page.locator(selector).getAttribute('class')) ?? '').split(/\s+/)
    expect(classes.includes(className)).to.equal(shouldHave)
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
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const actual = await this.page
      .locator(selector)
      .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
    expect(actual).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).count()).to.equal(expected)
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
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const box = await this.page.locator(selector).boundingBox()
    if (!box) throw new Error(`Element ${elementName} does not have a bounding box`)
    expect({
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }).to.deep.equal({ x, y, width, height })
  },
)
