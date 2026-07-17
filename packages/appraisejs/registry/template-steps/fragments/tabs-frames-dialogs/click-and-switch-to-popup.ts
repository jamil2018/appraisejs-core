/**
 * @name click and switch to popup
 * @description Click an element, wait for a popup tab, and switch the active page to it
 * @icon NAVIGATION
 */
When(
  'the user clicks the {string} element and switches to the opened popup',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const [popup] = await Promise.all([this.page.waitForEvent('popup'), this.page.locator(selector).click()])
    await popup.waitForLoadState('domcontentloaded')
    this.page = popup
  },
)
