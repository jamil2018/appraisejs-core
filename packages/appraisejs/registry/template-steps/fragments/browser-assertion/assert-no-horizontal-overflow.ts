/**
 * @name Assert no horizontal overflow
 * @description Assert that the document width fits within the configured viewport.
 * @icon VALIDATION
 */
Then('the page should have no horizontal overflow', async function (this: CustomWorld) {
  await executeHumanOperation('browser.assertions.no-horizontal-overflow@1', this, [], [])
})
