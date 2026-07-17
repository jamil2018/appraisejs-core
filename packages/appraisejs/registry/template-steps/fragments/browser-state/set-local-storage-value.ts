/**
 * @name set local storage value
 * @description Set a localStorage key and string value for the current page origin
 * @icon STORE
 */
When(
  'the user sets local storage key {string} to {string}',
  async function (this: CustomWorld, key: string, value: string) {
    await this.page.evaluate(
      ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
      [key, value],
    )
  },
)
