/**
 * @name assert local storage value
 * @description Assert a localStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'local storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    await executeHumanOperation(
      'browser.browser.assertion.assert.local.storage.value@1',
      this,
      ['key', 'expected'],
      [key, expected],
    )
  },
)
