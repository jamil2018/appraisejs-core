/**
 * @name double click
 * @description Template step for double clicking on an element
 * @icon MOUSE
 */
When('the user double clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).dblclick()
  } catch (error) {
    throw new Error(`Failed to double click on the ${elementName} element: ${error}`)
  }
})
