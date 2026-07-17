/**
 * @name assert element empty
 * @description Assert whether an input value or element text is empty
 * @icon VALIDATION
 */
Then(
  'the {string} element empty status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const value = await this.page.locator(selector).evaluate(element => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value
      }
      return element.textContent ?? ''
    })
    expect(value.length === 0).to.equal(expected)
  },
)
