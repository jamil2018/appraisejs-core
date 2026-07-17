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
 * @name tabs frames dialogs
 * @description Browser tabs, popups, iframe-scoped actions, and one-shot dialog handling
 * @type ACTION
 */

/**
 * @name switch browser tab
 * @description Switch to a browser tab or popup using its zero-based index
 * @icon NAVIGATION
 */
When('the user switches to browser tab {int}', async function (this: CustomWorld, index: number) {
  const pages = this.context.pages()
  const target = pages[index]
  if (!target) throw new Error(`Browser tab index ${index} does not exist; ${pages.length} tab(s) are open`)
  this.page = target
  await target.bringToFront()
})

/**
 * @name close current browser tab
 * @description Close the current tab and switch to the last remaining browser tab
 * @icon NAVIGATION
 */
When('the user closes the current browser tab', async function (this: CustomWorld) {
  await this.page.close()
  const pages = this.context.pages()
  const target = pages.at(-1)
  if (!target) throw new Error('No browser tabs remain after closing the current tab')
  this.page = target
  await target.bringToFront()
})

/**
 * @name click and switch to popup
 * @description Click an element, wait for a popup tab, and switch the active page to it
 * @icon NAVIGATION
 */
When(
  'the user clicks the {string} element and switches to the opened popup',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const [popup] = await Promise.all([this.page.waitForEvent('popup'), this.page.locator(selector).click()])
    await popup.waitForLoadState('domcontentloaded')
    this.page = popup
  },
)

/**
 * @name click element inside frame
 * @description Click a locator inside an iframe resolved from the shared locator library
 * @icon MOUSE
 */
When(
  'the user clicks the {string} element inside the {string} frame',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName) {
    const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
    const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
    if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
    await this.page.frameLocator(frameSelector).locator(elementSelector).click()
  },
)

/**
 * @name fill element inside frame
 * @description Fill a locator inside an iframe resolved from the shared locator library
 * @icon INPUT
 */
When(
  'the user fills the {string} element inside the {string} frame with {string}',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName, value: string) {
    const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
    const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
    if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
    await this.page.frameLocator(frameSelector).locator(elementSelector).fill(value)
  },
)

/**
 * @name accept next dialog
 * @description Accept the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user accepts the next browser dialog', async function (this: CustomWorld) {
  this.page.once('dialog', dialog => dialog.accept())
})

/**
 * @name dismiss next dialog
 * @description Dismiss the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user dismisses the next browser dialog', async function (this: CustomWorld) {
  this.page.once('dialog', dialog => dialog.dismiss())
})

/**
 * @name answer next prompt dialog
 * @description Accept the next browser prompt dialog with supplied text
 * @icon INPUT
 */
When('the user answers the next browser prompt with {string}', async function (this: CustomWorld, value: string) {
  this.page.once('dialog', dialog => dialog.accept(value))
})
