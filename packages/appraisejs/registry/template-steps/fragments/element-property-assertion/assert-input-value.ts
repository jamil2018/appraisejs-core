/**
 * @name assert input value
 * @description Assert an input, textarea, or select value exactly
 * @icon VALIDATION
 */
Then(
  'the {string} input value should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expected: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).inputValue()).to.equal(expected)
  },
)
