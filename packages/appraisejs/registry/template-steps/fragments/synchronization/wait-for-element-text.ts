/**
 * @name wait for element text
 * @description Wait until an element contains expected text
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to contain text {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedText: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).filter({ hasText: expectedText }).waitFor({ state: 'visible' })
  },
)
