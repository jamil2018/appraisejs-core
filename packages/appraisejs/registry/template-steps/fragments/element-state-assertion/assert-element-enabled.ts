/**
 * @name assert element enabled
 * @description Assert whether an element is enabled for interaction
 * @icon VALIDATION
 */
Then(
  'the {string} element enabled status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isEnabled()).to.equal(expected)
  },
)
