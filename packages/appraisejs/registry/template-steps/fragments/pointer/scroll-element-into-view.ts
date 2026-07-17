/**
 * @name scroll element into view
 * @description Scroll until the target element is inside the viewport
 * @icon MOUSE
 */
When('the user scrolls the {string} element into view', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).scrollIntoViewIfNeeded()
})
