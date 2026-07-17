/**
 * @name focus element
 * @description Move keyboard focus to an element
 * @icon MOUSE
 */
When('the user focuses the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).focus()
})
