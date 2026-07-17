/**
 * @name set storage from variable
 * @description Set a localStorage key from a stored runtime variable
 * @icon STORE
 */
When(
  'the user sets local storage key {string} from variable {string}',
  async function (this: CustomWorld, key: string, variableName: string) {
    const value = this.getVar<unknown>(variableName)
    if (typeof value !== 'string') throw new Error(`Stored variable ${variableName} must contain a string`)
    await this.page.evaluate(
      ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
      [key, value],
    )
  },
)
