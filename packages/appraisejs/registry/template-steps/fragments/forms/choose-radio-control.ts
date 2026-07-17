/**
 * @name choose radio control
 * @description Check a radio button or radio control element
 * @icon INPUT
 */
When('the user chooses the {string} radio control', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).check()
})
