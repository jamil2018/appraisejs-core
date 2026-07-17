/**
 * @name click element coordinates
 * @description Click an x and y coordinate relative to a locator element
 * @icon MOUSE
 */
When(
  'the user clicks coordinates x {int} and y {int} inside the {string} element',
  async function (this: CustomWorld, x: number, y: number, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).click({ position: { x, y } })
  },
)
