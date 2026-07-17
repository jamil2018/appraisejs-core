/**
 * @name assert local storage value
 * @description Assert a localStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'local storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    const actual = await this.page.evaluate(storageKey => localStorage.getItem(storageKey), key)
    expect(actual ?? '').to.equal(expected)
  },
)
