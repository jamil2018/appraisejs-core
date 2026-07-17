/**
 * @name assert element checked
 * @description Assert whether a checkbox or radio control is checked
 * @icon VALIDATION
 */
Then(
  'the {string} element checked status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).isChecked()).to.equal(expected)
  },
)
