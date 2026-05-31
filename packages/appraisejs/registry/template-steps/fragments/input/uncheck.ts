/**
 * @name uncheck
 * @description Template step for unchecking a checkbox
 * @icon INPUT
 */
When('the user unchecks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found`)
  }
  try {
    await this.page.locator(selector).uncheck()
  } catch (error) {
    throw new Error(`Failed to uncheck the ${elementName} checkbox: ${error}`)
  }
})
