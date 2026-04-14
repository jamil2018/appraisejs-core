/**
 * @name right click
 * @description Template step for right clicking on an element
 * @icon MOUSE
 */
When('the user right clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) {
    throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
  }
  try {
    await this.page.locator(selector).click({ button: 'right' })
  } catch (error) {
    throw new Error(`Failed to right click on the ${elementName} element: ${error}`)
  }
})
