/**
 * @name select dropdown option
 * @description Template step for selecting a particular option inside a dropdown element
 * @icon INPUT
 */
When(
  'the user selects the {string} option of the {string} dropdown',
  async function (this: CustomWorld, optionName: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }
    try {
      await this.page.locator(selector).selectOption(optionName)
    } catch (error) {
      throw new Error(`Failed to select the ${optionName} option of the ${elementName} dropdown: ${error}`)
    }
  },
)
