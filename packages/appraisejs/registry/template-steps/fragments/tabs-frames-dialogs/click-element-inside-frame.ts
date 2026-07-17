/**
 * @name click element inside frame
 * @description Click a locator inside an iframe resolved from the shared locator library
 * @icon MOUSE
 */
When(
  'the user clicks the {string} element inside the {string} frame',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName) {
    const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
    const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
    if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
    await this.page.frameLocator(frameSelector).locator(elementSelector).click()
  },
)
