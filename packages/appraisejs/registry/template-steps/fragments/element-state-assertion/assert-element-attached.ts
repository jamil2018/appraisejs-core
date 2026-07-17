/**
 * @name assert element attached
 * @description Assert whether an element is attached to the DOM
 * @icon VALIDATION
 */
Then(
  'the {string} element attached status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect((await this.page.locator(selector).count()) > 0).to.equal(expected)
  },
)
