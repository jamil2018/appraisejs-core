/**
 * @name Assert no browser errors
 * @description Assert that the page emitted no console errors or uncaught page errors during the scenario.
 * @icon VALIDATION
 */
Then('the browser should have no console or page errors', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-console-errors@1', this, [], [])
})
