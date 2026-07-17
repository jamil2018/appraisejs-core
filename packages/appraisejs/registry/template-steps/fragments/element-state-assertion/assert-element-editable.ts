/**
 * @name assert element editable
 * @description Assert whether an input or content-editable element is editable
 * @icon VALIDATION
 */
Then(
  'the {string} element editable status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isEditable()).to.equal(expected)
  },
)
