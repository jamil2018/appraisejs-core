/**
 * @name wait for element to disappear
 * @description Wait for an element to become hidden or detached
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      await this.page.locator(selector).waitFor({ state: 'hidden' })
    } catch (error) {
      throw new Error(`Failed to wait for the ${elementName} element to disappear: ${error}`)
    }
  },
)
