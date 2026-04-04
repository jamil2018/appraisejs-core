/**
 * @name click
 * @description Template step for clicking on an element
 * @icon MOUSE
 */
When('the user clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).click()
  } catch (error) {
    throw new Error(`Failed to click on the ${elementName} element: ${error}`)
  }
})
