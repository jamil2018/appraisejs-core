/**
 * @name assert url contains
 * @description Assert whether the complete current page URL contains expected text
 * @icon VALIDATION
 */
Then('the full page url should contain {string}', async function (this: CustomWorld, expected: string) {
  expect(this.page.url()).to.contain(expected)
})
