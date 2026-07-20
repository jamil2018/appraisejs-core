/**
 * @name Assert absent or hidden
 * @description Assert that a resolved target is absent from the DOM or not visible.
 * @icon VALIDATION
 */
Then('the {string} element should be hidden or absent', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.hidden@1', this, ['target'], [target])
})
