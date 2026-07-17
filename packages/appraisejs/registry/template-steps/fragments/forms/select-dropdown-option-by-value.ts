/**
 * @name select dropdown option by value
 * @description Select a dropdown option using its HTML value
 * @icon INPUT
 */
When(
  'the user selects value {string} from the {string} dropdown',
  async function (this: CustomWorld, value: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ value })
  },
)
