/**
 * @name assert element attribute
 * @description Assert an element attribute exactly, using an empty string for a missing attribute
 * @icon VALIDATION
 */
Then(
  'the {string} element attribute {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, attribute: string, expected: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect((await this.page.locator(selector).getAttribute(attribute)) ?? '').to.equal(expected)
  },
)
