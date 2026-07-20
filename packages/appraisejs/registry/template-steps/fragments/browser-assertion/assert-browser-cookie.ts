/**
 * @name assert browser cookie
 * @description Assert a browser cookie value for the current page URL
 * @icon VALIDATION
 */
Then(
  'the browser cookie {string} should equal {string}',
  async function (this: CustomWorld, name: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.browser.cookie@1',
      this,
      ['name', 'expected'],
      [name, expected],
    )
  },
)
