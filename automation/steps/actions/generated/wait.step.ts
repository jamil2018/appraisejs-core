import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name wait
 * @description Generated human projections for canonical wait operations
 * @type ACTION
 */

/**
 * @name wait for element
 * @description Wait for an element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation('browser.wait.wait.for.element@1', this, ['elementName'], [elementName])
  },
)

/**
 * @name wait for element to disappear
 * @description Wait for an element to become hidden or detached
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation('browser.wait.wait.for.element.to.disappear@1', this, ['elementName'], [elementName])
  },
)

/**
 * @name wait for url route
 * @description Wait for the current URL path to match a route
 * @icon WAIT
 */
When('the user waits for the route {string} to be loaded', async function (this: CustomWorld, route: string) {
  await executeHumanOperation('browser.wait.wait.for.url.route@1', this, ['route'], [route])
})

/**
 * @name Wait for duration
 * @description Wait for a bounded number of seconds.
 * @icon WAIT
 */
When('the user waits for {int} seconds', async function (this: CustomWorld, duration: number) {
  await executeHumanOperation('browser.waits.duration@1', this, ['duration'], [duration])
})

/**
 * @name Wait for page
 * @description Wait for the current page load state.
 * @icon WAIT
 */
When('the user waits for the current page to be loaded', async function (this: CustomWorld) {
  await executeHumanOperation('browser.waits.page-ready@1', this, [], [])
})

/**
 * @name Wait with timeout
 * @description Wait using a bounded millisecond timeout.
 * @icon WAIT
 */
When('the user waits for {int} milliseconds', async function (this: CustomWorld, timeout: number) {
  await executeHumanOperation('browser.waits.timeout@1', this, ['timeout'], [timeout])
})
