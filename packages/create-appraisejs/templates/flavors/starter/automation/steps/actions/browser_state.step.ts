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
 * @name browser state
 * @description Navigation, viewport, cookies, local storage, session storage, and stored URL actions
 * @type ACTION
 */

/**
 * @name go forward
 * @description Navigate forward to the next page in browser history
 * @icon NAVIGATION
 */
When('the user goes forward to the next page', async function (this: CustomWorld) {
  await this.page.goForward({ waitUntil: 'domcontentloaded' })
})

/**
 * @name navigate to stored url
 * @description Navigate to a URL read from a stored runtime variable
 * @icon NAVIGATION
 */
When('the user navigates to the url in variable {string}', async function (this: CustomWorld, variableName: string) {
  const url = this.getVar<unknown>(variableName)
  if (typeof url !== 'string') throw new Error(`Stored variable ${variableName} must contain a URL string`)
  await this.page.goto(url, { waitUntil: 'domcontentloaded' })
})

/**
 * @name set viewport size
 * @description Set the browser viewport width and height in pixels
 * @icon NAVIGATION
 */
When(
  'the user sets the viewport to width {int} and height {int}',
  async function (this: CustomWorld, width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Viewport width and height must be positive integers')
    await this.page.setViewportSize({ width, height })
  },
)

/**
 * @name set browser cookie
 * @description Set a cookie for the current page URL
 * @icon DATA
 */
When(
  'the user sets the browser cookie {string} to {string}',
  async function (this: CustomWorld, name: string, value: string) {
    await this.context.addCookies([{ name, value, url: this.page.url() }])
  },
)

/**
 * @name clear browser cookies
 * @description Clear every cookie in the current browser context
 * @icon DATA
 */
When('the user clears all browser cookies', async function (this: CustomWorld) {
  await this.context.clearCookies()
})

/**
 * @name set local storage value
 * @description Set a localStorage key and string value for the current page origin
 * @icon STORE
 */
When(
  'the user sets local storage key {string} to {string}',
  async function (this: CustomWorld, key: string, value: string) {
    await this.page.evaluate(
      ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
      [key, value],
    )
  },
)

/**
 * @name set session storage value
 * @description Set a sessionStorage key and string value for the current page origin
 * @icon STORE
 */
When(
  'the user sets session storage key {string} to {string}',
  async function (this: CustomWorld, key: string, value: string) {
    await this.page.evaluate(
      ([storageKey, storageValue]) => sessionStorage.setItem(storageKey, storageValue),
      [key, value],
    )
  },
)

/**
 * @name set storage from variable
 * @description Set a localStorage key from a stored runtime variable
 * @icon STORE
 */
When(
  'the user sets local storage key {string} from variable {string}',
  async function (this: CustomWorld, key: string, variableName: string) {
    const value = this.getVar<unknown>(variableName)
    if (typeof value !== 'string') throw new Error(`Stored variable ${variableName} must contain a string`)
    await this.page.evaluate(
      ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
      [key, value],
    )
  },
)

/**
 * @name clear web storage
 * @description Clear both localStorage and sessionStorage for the current page origin
 * @icon STORE
 */
When('the user clears local and session storage', async function (this: CustomWorld) {
  await this.page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})
