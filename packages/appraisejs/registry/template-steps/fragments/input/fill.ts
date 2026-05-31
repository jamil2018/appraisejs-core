/**
 * @name fill
 * @description Template step for filling up an input field with a provided value
 * @icon INPUT
 */
When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }
    try {
      await this.page.locator(selector).fill(value)
    } catch (error) {
      throw new Error(`Failed to fill in the ${elementName} input field with value ${value}: ${error}`)
    }
  },
)
