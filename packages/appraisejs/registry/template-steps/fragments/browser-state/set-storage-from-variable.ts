/**
 * @name set storage from variable
 * @description Set a localStorage key from a stored runtime variable
 * @icon STORE
 */
When(
  'the user sets local storage key {string} from variable {string}',
  async function (this: CustomWorld, key: string, variableName: string) {
    await executeHumanOperation(
      'browser.browser.state.set.storage.from.variable@1',
      this,
      ['key', 'variableName'],
      [key, variableName],
    )
  },
)
