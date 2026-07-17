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
 * @name pointer
 * @description Pointer, mouse, drag, focus, scroll, and element screenshot actions
 * @type ACTION
 */

/**
 * @name click page coordinates
 * @description Click an exact x and y page coordinate with the mouse pointer
 * @icon MOUSE
 */
When('the user clicks page coordinates x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await this.page.mouse.click(x, y)
})

/**
 * @name click element coordinates
 * @description Click an x and y coordinate relative to a locator element
 * @icon MOUSE
 */
When(
  'the user clicks coordinates x {int} and y {int} inside the {string} element',
  async function (this: CustomWorld, x: number, y: number, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).click({ position: { x, y } })
  },
)

/**
 * @name force click element
 * @description Force click an element when actionability checks must be bypassed deliberately
 * @icon MOUSE
 */
When('the user force clicks the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).click({ force: true })
})

/**
 * @name drag element to element
 * @description Drag a source locator and drop it onto a target locator
 * @icon MOUSE
 */
When(
  'the user drags the {string} element onto the {string} element',
  async function (this: CustomWorld, sourceName: SelectorName, targetName: SelectorName) {
    const sourceSelector = await resolveLocator(this.page, sourceName)
    const targetSelector = await resolveLocator(this.page, targetName)
    if (!sourceSelector) throw new Error(`Selector ${sourceName} not found`)
    if (!targetSelector) throw new Error(`Selector ${targetName} not found`)
    await this.page.locator(sourceSelector).dragTo(this.page.locator(targetSelector))
  },
)

/**
 * @name focus element
 * @description Move keyboard focus to an element
 * @icon MOUSE
 */
When('the user focuses the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).focus()
})

/**
 * @name blur element
 * @description Remove keyboard focus from an element
 * @icon MOUSE
 */
When('the user blurs the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).blur()
})

/**
 * @name scroll element into view
 * @description Scroll until the target element is inside the viewport
 * @icon MOUSE
 */
When('the user scrolls the {string} element into view', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).scrollIntoViewIfNeeded()
})

/**
 * @name scroll page by offset
 * @description Scroll the page horizontally and vertically by pixel offsets
 * @icon MOUSE
 */
When('the user scrolls the page by x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await this.page.mouse.wheel(x, y)
})

/**
 * @name capture element screenshot
 * @description Capture an element screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a screenshot of the {string} element in the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const screenshot = await this.page.locator(selector).screenshot()
    this.setVar(variableName, screenshot.toString('base64'))
  },
)
