/**
 * @name hover
 * @description Template step for hovering over an element
 * @icon MOUSE
 */
When(
  'the user hovers the cursor over the {string} element',
  async function (this: CustomWorld, elementName: SelectorName) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      await this.page.locator(selector).hover()
    } catch (error) {
      throw new Error(`Failed to hover over the ${elementName} element: ${error}`)
    }
  },
)
