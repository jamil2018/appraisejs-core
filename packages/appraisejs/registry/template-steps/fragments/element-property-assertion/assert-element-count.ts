/**
 * @name assert element count
 * @description Assert the number of elements matched by a locator
 * @icon VALIDATION
 */
Then(
  'the {string} locator should match {int} elements',
  async function (this: CustomWorld, elementName: SelectorName, expected: number) {
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    expect(await this.page.locator(selector).count()).to.equal(expected)
  },
)
