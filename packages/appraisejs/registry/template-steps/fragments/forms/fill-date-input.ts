/**
 * @name fill date input
 * @description Fill a date or datetime input with an ISO-compatible value
 * @icon INPUT
 */
When(
  'the user fills the {string} date input with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).fill(value)
  },
)
