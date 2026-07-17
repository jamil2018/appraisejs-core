/**
 * @name fill content editable element
 * @description Fill a contenteditable rich-text element with text
 * @icon INPUT
 */
When(
  'the user fills the content editable {string} element with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).fill(value)
  },
)
