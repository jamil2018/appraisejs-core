/**
 * @name set session storage value
 * @description Set a sessionStorage key and string value for the current page origin
 * @icon STORE
 */
When(
  'the user sets session storage key {string} to {string}',
  async function (this: CustomWorld, key: string, value: string) {
    await executeHumanOperation(
      'browser.browser.state.set.session.storage.value@1',
      this,
      ['key', 'value'],
      [key, value],
    )
  },
)
