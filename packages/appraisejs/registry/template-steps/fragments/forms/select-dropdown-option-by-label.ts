/**
 * @name select dropdown option by label
 * @description Select a dropdown option using its visible label text
 * @icon INPUT
 */
When(
  'the user selects label {string} from the {string} dropdown',
  async function (this: CustomWorld, label: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ label })
  },
)
