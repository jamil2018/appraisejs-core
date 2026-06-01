/**
 * @name clear
 * @description Template step for clearing an input field
 * @icon INPUT
 */
When('the user clears the {string} field', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).clear()
  } catch (error) {
    throw new Error(`Failed to clear the ${elementName} field: ${error}`)
  }
})
