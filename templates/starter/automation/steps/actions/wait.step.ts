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
} from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name wait
 * @description Template step group for waiting on time or page state
 * @type ACTION
 */

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name wait for page load
 * @description Wait for the current page to finish loading
 * @icon WAIT
 */
When('the user waits for the current page to be loaded', async function (this: CustomWorld) {
  try {
    await this.page.waitForLoadState('domcontentloaded')
  } catch (error) {
    throw new Error(`Failed to wait for the current page to be loaded: ${error}`)
  }
})

/**
 * @name wait for element
 * @description Wait for an element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      await this.page.locator(selector).waitFor({ state: 'visible' })
    } catch (error) {
      throw new Error(`Failed to wait for the element ${elementName} to become visible: ${error}`)
    }
  },
)

/**
 * @name wait for url route
 * @description Wait for the current URL path to match a route
 * @icon WAIT
 */
When('the user waits for the route {string} to be loaded', async function (this: CustomWorld, route: string) {
  try {
    await this.page.waitForURL(url => url.pathname === route || url.pathname.endsWith(route))
  } catch (error) {
    throw new Error(`Failed to wait for the route ${route} to be loaded: ${error}`)
  }
})

/**
 * @name wait for element to disappear
 * @description Wait for an element to become hidden or detached
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      await this.page.locator(selector).waitFor({ state: 'hidden' })
    } catch (error) {
      throw new Error(`Failed to wait for the ${elementName} element to disappear: ${error}`)
    }
  },
)

/**
 * @name wait for specific amount of seconds
 * @description Wait for a specific number of seconds
 * @icon WAIT
 */
When('the user waits for {int} seconds', async function (this: CustomWorld, seconds: number) {
  try {
    await this.page.waitForTimeout(seconds * 1000)
  } catch (error) {
    throw new Error(`Failed to wait for ${seconds} seconds: ${error}`)
  }
})
