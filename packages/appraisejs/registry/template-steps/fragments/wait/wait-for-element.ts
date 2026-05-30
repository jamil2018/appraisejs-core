/**
 * @name wait for element
 * @description Wait for an element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      await this.page.locator(selector).waitFor({ state: 'visible' })
    } catch (error) {
      throw new Error(`Failed to wait for the element ${elementName} to become visible: ${error}`)
    }
  },
)
