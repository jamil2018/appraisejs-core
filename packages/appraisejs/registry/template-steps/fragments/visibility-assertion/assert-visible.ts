/**
 * @name Assert visible
 * @description Assert that a resolved locator is visible.
 * @icon VALIDATION
 */
Then('the {string} element should be visible', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.visible@1', this, ['target'], [target])
})
