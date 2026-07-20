import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name browser assertion
 * @description Generated human projections for canonical browser assertion operations
 * @type VALIDATION
 */

/**
 * @name Assert no browser errors
 * @description Assert that the page emitted no console errors or uncaught page errors during the scenario.
 * @icon VALIDATION
 */
Then('the browser should have no console or page errors', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-console-errors@1', this, [], [])
})

/**
 * @name Assert no failed network requests
 * @description Assert that the page emitted no failed requests or HTTP error responses during the scenario.
 * @icon VALIDATION
 */
Then('the browser should have no failed network requests', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-failed-network-requests@1', this, [], [])
})

/**
 * @name Assert no horizontal overflow
 * @description Assert that the document width fits within the configured viewport.
 * @icon VALIDATION
 */
Then('the page should have no horizontal overflow', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-horizontal-overflow@1', this, [], [])
})

/**
 * @name assert browser cookie
 * @description Assert a browser cookie value for the current page URL
 * @icon VALIDATION
 */
Then(
  'the browser cookie {string} should equal {string}',
  async function (this: CustomWorld, name: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.browser.cookie@1',
      this,
      ['name', 'expected'],
      [name, expected],
    )
  },
)

/**
 * @name assert full url
 * @description Assert whether the complete current page URL equals an expected URL
 * @icon VALIDATION
 */
Then('the full page url should equal {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.browser.assertion.assert.full.url@1', this, ['expected'], [expected])
})

/**
 * @name assert local storage value
 * @description Assert a localStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'local storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.local.storage.value@1',
      this,
      ['key', 'expected'],
      [key, expected],
    )
  },
)

/**
 * @name assert page title
 * @description Assert the current browser page title exactly
 * @icon VALIDATION
 */
Then('the page title should equal {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.browser.assertion.assert.page.title@1', this, ['expected'], [expected])
})

/**
 * @name assert session storage value
 * @description Assert a sessionStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'session storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.session.storage.value@1',
      this,
      ['key', 'expected'],
      [key, expected],
    )
  },
)

/**
 * @name assert url contains
 * @description Assert whether the complete current page URL contains expected text
 * @icon VALIDATION
 */
Then('the full page url should contain {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.browser.assertion.assert.url.contains@1', this, ['expected'], [expected])
})
