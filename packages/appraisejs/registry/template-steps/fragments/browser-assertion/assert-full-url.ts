/**
 * @name assert full url
 * @description Assert whether the complete current page URL equals an expected URL
 * @icon VALIDATION
 */
Then('the full page url should equal {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.browser.assertion.assert.full.url@1', this, ['expected'], [expected])
})
