/**
 * @name assert browser cookie
 * @description Assert a browser cookie value for the current page URL
 * @icon VALIDATION
 */
Then(
  'the browser cookie {string} should equal {string}',
  async function (this: CustomWorld, name: string, expected: string) {
    const cookies = await this.context.cookies(this.page.url())
    expect(cookies.find(cookie => cookie.name === name)?.value ?? '').to.equal(expected)
  },
)
