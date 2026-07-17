/**
 * @name assert element focused
 * @description Assert whether an element currently has document focus
 * @icon VALIDATION
 */
Then(
  'the {string} element focused status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const focused = await this.page.locator(selector).evaluate(element => element === document.activeElement)
    expect(focused).to.equal(expected)
  },
)
