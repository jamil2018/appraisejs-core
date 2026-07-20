/**
 * @name assert page title
 * @description Assert the current browser page title exactly
 * @icon VALIDATION
 */
Then('the page title should equal {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.browser.assertion.assert.page.title@1', this, ['expected'], [expected])
})
