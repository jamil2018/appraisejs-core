/**
 * @name force click element
 * @description Force click an element when actionability checks must be bypassed deliberately
 * @icon MOUSE
 */
When('the user force clicks the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).click({ force: true })
})
