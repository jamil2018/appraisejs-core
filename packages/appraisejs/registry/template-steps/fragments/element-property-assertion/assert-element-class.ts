/**
 * @name assert element class
 * @description Assert whether an element class list contains a class name
 * @icon VALIDATION
 */
Then(
  'the {string} element should {boolean} have class {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldHave: boolean, className: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const classes = ((await this.page.locator(selector).getAttribute('class')) ?? '').split(/\s+/)
    expect(classes.includes(className)).to.equal(shouldHave)
  },
)
