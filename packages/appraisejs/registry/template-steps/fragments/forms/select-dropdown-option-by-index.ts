/**
 * @name select dropdown option by index
 * @description Select a dropdown option using its zero-based index
 * @icon INPUT
 */
When(
  'the user selects option index {int} from the {string} dropdown',
  async function (this: CustomWorld, index: number, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ index })
  },
)
