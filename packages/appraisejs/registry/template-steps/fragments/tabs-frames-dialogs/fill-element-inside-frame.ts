/**
 * @name fill element inside frame
 * @description Fill a locator inside an iframe resolved from the shared locator library
 * @icon INPUT
 */
When(
  'the user fills the {string} element inside the {string} frame with {string}',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName, value: string) {
    const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
    const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
    if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
    await this.page.frameLocator(frameSelector).locator(elementSelector).fill(value)
  },
)
