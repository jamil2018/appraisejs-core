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
 * @name browser assertion
 * @description Full URL, page title, cookies, local storage, and session storage assertions
 * @type VALIDATION
 */

/**
 * @name assert full url
 * @description Assert whether the complete current page URL equals an expected URL
 * @icon VALIDATION
 */
Then('the full page url should equal {string}', async function (this: CustomWorld, expected: string) {
  expect(this.page.url()).to.equal(expected)
})

/**
 * @name assert url contains
 * @description Assert whether the complete current page URL contains expected text
 * @icon VALIDATION
 */
Then('the full page url should contain {string}', async function (this: CustomWorld, expected: string) {
  expect(this.page.url()).to.contain(expected)
})

/**
 * @name assert page title
 * @description Assert the current browser page title exactly
 * @icon VALIDATION
 */
Then('the page title should equal {string}', async function (this: CustomWorld, expected: string) {
  expect(await this.page.title()).to.equal(expected)
})

/**
 * @name assert browser cookie
 * @description Assert a browser cookie value for the current page URL
 * @icon VALIDATION
 */
Then(
  'the browser cookie {string} should equal {string}',
  async function (this: CustomWorld, name: string, expected: string) {
    const cookies = await this.context.cookies(this.page.url())
    expect(cookies.find(cookie => cookie.name === name)?.value ?? '').to.equal(expected)
  },
)

/**
 * @name assert local storage value
 * @description Assert a localStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'local storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    const actual = await this.page.evaluate(storageKey => localStorage.getItem(storageKey), key)
    expect(actual ?? '').to.equal(expected)
  },
)

/**
 * @name assert session storage value
 * @description Assert a sessionStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'session storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    const actual = await this.page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)
    expect(actual ?? '').to.equal(expected)
  },
)
