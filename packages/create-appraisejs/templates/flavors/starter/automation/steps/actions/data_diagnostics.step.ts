import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name data diagnostics
 * @description Store attributes, URLs, titles, log variables, and capture diagnostic screenshots
 * @type ACTION
 */

/**
 * @name store element attribute
 * @description Store an element attribute value in a runtime variable
 * @icon STORE
 */
When(
  'the user stores attribute {string} from the {string} element in variable {string}',
  async function (this: CustomWorld, attribute: string, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    this.setVar(variableName, (await this.page.locator(selector).getAttribute(attribute)) ?? '')
  },
)

/**
 * @name store current url
 * @description Store the current browser page URL in a runtime variable
 * @icon STORE
 */
When('the user stores the current url in variable {string}', async function (this: CustomWorld, variableName: string) {
  this.setVar(variableName, this.page.url())
})

/**
 * @name store page title
 * @description Store the current browser page title in a runtime variable
 * @icon STORE
 */
When('the user stores the page title in variable {string}', async function (this: CustomWorld, variableName: string) {
  this.setVar(variableName, await this.page.title())
})

/**
 * @name log stored variable
 * @description Log a stored runtime variable as JSON for test diagnostics
 * @icon DEBUG
 */
When('the user logs the stored variable {string}', async function (this: CustomWorld, variableName: string) {
  const value = this.getVar(variableName)
  console.log(`[stored:${variableName}]`, JSON.stringify(value))
})

/**
 * @name capture page screenshot
 * @description Capture a full-page screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a full page screenshot in variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const screenshot = await this.page.screenshot({ fullPage: true })
    this.setVar(variableName, screenshot.toString('base64'))
  },
)
