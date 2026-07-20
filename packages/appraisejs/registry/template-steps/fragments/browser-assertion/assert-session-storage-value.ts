/**
 * @name assert session storage value
 * @description Assert a sessionStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'session storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.session.storage.value@1',
      this,
      ['key', 'expected'],
      [key, expected],
    )
  },
)
