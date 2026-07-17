/**
 * @name assert session storage value
 * @description Assert a sessionStorage key value for the current page origin
 * @icon VALIDATION
 */
Then(
  'session storage key {string} should equal {string}',
  async function (this: CustomWorld, key: string, expected: string) {
    const actual = await this.page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)
    expect(actual ?? '').to.equal(expected)
  },
)
