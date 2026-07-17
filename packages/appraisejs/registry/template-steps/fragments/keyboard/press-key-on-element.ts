/**
 * @name press key on element
 * @description Press one key or a Playwright key combination while an element is targeted
 * @icon INPUT
 */
When(
  'the user presses the {string} key on the {string} element',
  async function (this: CustomWorld, key: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).press(key)
  },
)
