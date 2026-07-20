/**
 * @name Assert accessible
 * @description Assert that the resolved target exposes an accessible name and role.
 * @icon VALIDATION
 */
Then('the {string} element should have an accessible name', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.accessible@1', this, ['target'], [target])
})
