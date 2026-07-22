import { CustomWorld, When, executeHumanOperation } from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name navigation
 * @description Generated human projections for canonical navigation operations
 * @type ACTION
 */

/**
 * @name go back
 * @description Template step for going back to the previous page
 * @icon NAVIGATION
 */
When('the user goes back to the previous page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.go.back@1', this, [], [])
})

/**
 * @name Navigate to URL
 * @description Navigate to an absolute or environment-relative URL.
 * @icon NAVIGATION
 */
When('the user navigates to the {string} url', async function (this: CustomWorld, url: string) {
  await executeHumanOperation('browser.navigation.goto@1', this, ['url'], [url])
})

/**
 * @name navigate to environment base url
 * @description Navigate to the base url of the selected environment
 * @icon NAVIGATION
 */
When('the user navigates to the base url of the selected environment', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.navigate.to.environment.base.url@1', this, [], [])
})

/**
 * @name Reload page
 * @description Reload the current browser page.
 * @icon NAVIGATION
 */
When('the user reloads the page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.reload@1', this, [], [])
})
