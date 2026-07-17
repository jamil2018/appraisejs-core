/**
 * @name blur element
 * @description Remove keyboard focus from an element
 * @icon MOUSE
 */
When('the user blurs the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).blur()
})
