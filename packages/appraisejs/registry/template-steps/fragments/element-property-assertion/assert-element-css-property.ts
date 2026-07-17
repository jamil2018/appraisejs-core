/**
 * @name assert element css property
 * @description Assert a computed CSS property value for an element
 * @icon VALIDATION
 */
Then(
  'the {string} element css property {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, property: string, expected: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const actual = await this.page
      .locator(selector)
      .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
    expect(actual).to.equal(expected)
  },
)
