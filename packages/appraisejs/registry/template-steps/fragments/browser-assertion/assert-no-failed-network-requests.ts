/**
 * @name Assert no failed network requests
 * @description Assert that the page emitted no failed requests or HTTP error responses during the scenario.
 * @icon VALIDATION
 */
Then('the browser should have no failed network requests', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-failed-network-requests@1', this, [], [])
})
