/**
 * @name set browser cookie
 * @description Set a cookie for the current page URL
 * @icon DATA
 */
When(
  'the user sets the browser cookie {string} to {string}',
  async function (this: CustomWorld, name: string, value: string) {
    await executeHumanOperation('browser.browser.state.set.browser.cookie@1', this, ['name', 'value'], [name, value])
  },
)
