import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name synchronization
 * @description URL, load-state, locator-state, text, value, request, response, popup, and dialog waits
 * @type ACTION
 */

/**
 * @name wait for url
 * @description Wait until the current URL contains expected text
 * @icon WAIT
 */
When('the user waits for the url to contain {string}', async function (this: CustomWorld, expected: string) {
  await this.page.waitForURL(url => url.toString().includes(expected))
})

/**
 * @name wait for load state
 * @description Wait for load, domcontentloaded, or networkidle page state
 * @icon WAIT
 */
When('the user waits for page load state {string}', async function (this: CustomWorld, state: string) {
  if (!['load', 'domcontentloaded', 'networkidle'].includes(state)) {
    throw new Error(`Unsupported page load state: ${state}`)
  }
  await this.page.waitForLoadState(state as 'load' | 'domcontentloaded' | 'networkidle')
})

/**
 * @name wait for element state
 * @description Wait for an element to become attached, detached, visible, or hidden
 * @icon WAIT
 */
When(
  'the user waits for the {string} element state to be {string}',
  async function (this: CustomWorld, elementName: SelectorName, state: string) {
    if (!['attached', 'detached', 'visible', 'hidden'].includes(state)) {
      throw new Error(`Unsupported element wait state: ${state}`)
    }
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).waitFor({ state: state as 'attached' | 'detached' | 'visible' | 'hidden' })
  },
)

/**
 * @name wait for element text
 * @description Wait until an element contains expected text
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to contain text {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedText: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).filter({ hasText: expectedText }).waitFor({ state: 'visible' })
  },
)

/**
 * @name wait for input value
 * @description Wait until an input element equals an expected value
 * @icon WAIT
 */
When(
  'the user waits for the {string} input value to equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedValue: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).evaluate(
      (element, value) =>
        new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 10_000
          const timer = setInterval(() => {
            if ((element as HTMLInputElement).value === value) {
              clearInterval(timer)
              resolve()
            } else if (Date.now() >= deadline) {
              clearInterval(timer)
              reject(new Error(`Input value did not become ${value}`))
            }
          }, 50)
        }),
      expectedValue,
    )
  },
)

/**
 * @name wait for request
 * @description Wait for an outgoing HTTP request whose URL contains expected text
 * @icon WAIT
 */
When('the user waits for a request url containing {string}', async function (this: CustomWorld, urlPart: string) {
  await this.page.waitForRequest(request => request.url().includes(urlPart))
})

/**
 * @name wait for response
 * @description Wait for an HTTP response whose URL contains text and status equals the expected code
 * @icon WAIT
 */
When(
  'the user waits for a response url containing {string} with status {int}',
  async function (this: CustomWorld, urlPart: string, status: number) {
    await this.page.waitForResponse(response => response.url().includes(urlPart) && response.status() === status)
  },
)

/**
 * @name wait for popup
 * @description Wait for a popup event and store the opened page in a runtime variable
 * @icon WAIT
 */
When('the user waits for a popup and stores it in {string}', async function (this: CustomWorld, variableName: string) {
  this.setVar(variableName, await this.page.waitForEvent('popup'))
})

/**
 * @name wait for dialog
 * @description Wait for the next browser dialog and store its message in a runtime variable
 * @icon WAIT
 */
When(
  'the user waits for a dialog and stores its message in {string}',
  async function (this: CustomWorld, variableName: string) {
    const dialog = await this.page.waitForEvent('dialog')
    this.setVar(variableName, dialog.message())
    await dialog.dismiss()
  },
)
