/**
 * @name check
 * @description Template step for checking a checkbox
 * @icon INPUT
 */
When('the user checks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).check()
  } catch (error) {
    throw new Error(`Failed to check the ${elementName} checkbox: ${error}`)
  }
})
