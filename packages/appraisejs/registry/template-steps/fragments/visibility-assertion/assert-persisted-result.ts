/**
 * @name Assert persisted result
 * @description Assert that a persisted result is represented by the resolved target.
 * @icon VALIDATION
 */
Then('the persisted {string} element should be visible', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.persisted@1', this, ['target'], [target])
})
