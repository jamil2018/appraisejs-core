import { CustomWorld, When, executeHumanOperation } from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name browser state
 * @description Generated human projections for canonical browser state operations
 * @type ACTION
 */

/**
 * @name clear browser cookies
 * @description Clear every cookie in the current browser context
 * @icon DATA
 */
When('the user clears all browser cookies', async function (this: CustomWorld) {
  await executeHumanOperation('browser.browser.state.clear.browser.cookies@1', this, [], [])
})

/**
 * @name clear web storage
 * @description Clear both localStorage and sessionStorage for the current page origin
 * @icon STORE
 */
When('the user clears local and session storage', async function (this: CustomWorld) {
  await executeHumanOperation('browser.browser.state.clear.web.storage@1', this, [], [])
})

/**
 * @name go forward
 * @description Navigate forward to the next page in browser history
 * @icon NAVIGATION
 */
When('the user goes forward to the next page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.browser.state.go.forward@1', this, [], [])
})

/**
 * @name navigate to stored url
 * @description Navigate to a URL read from a stored runtime variable
 * @icon NAVIGATION
 */
When('the user navigates to the url in variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.browser.state.navigate.to.stored.url@1', this, ['variableName'], [variableName])
})

/**
 * @name set browser cookie
 * @description Set a cookie for the current page URL
 * @icon DATA
 */
When(
  'the user sets the browser cookie {string} to {string}',
  async function (this: CustomWorld, name: string, value: string) {
    await executeHumanOperation('browser.browser.state.set.browser.cookie@1', this, ['name', 'value'], [name, value])
  },
)

/**
 * @name set local storage value
 * @description Set a localStorage key and string value for the current page origin
 * @icon STORE
 */
When(
  'the user sets local storage key {string} to {string}',
  async function (this: CustomWorld, key: string, value: string) {
    await executeHumanOperation('browser.browser.state.set.local.storage.value@1', this, ['key', 'value'], [key, value])
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
    await executeHumanOperation(
      'browser.browser.state.set.session.storage.value@1',
      this,
      ['key', 'value'],
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
    await executeHumanOperation(
      'browser.browser.state.set.storage.from.variable@1',
      this,
      ['key', 'variableName'],
      [key, variableName],
    )
  },
)

/**
 * @name Set viewport size
 * @description Set the browser viewport to an exact width and height.
 * @icon NAVIGATION
 */
When(
  'the user sets the viewport to width {int} and height {int}',
  async function (this: CustomWorld, width: number, height: number) {
    await executeHumanOperation('browser.viewport.set@1', this, ['width', 'height'], [width, height])
  },
)
