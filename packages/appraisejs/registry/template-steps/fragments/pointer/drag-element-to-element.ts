/**
 * @name drag element to element
 * @description Drag a source locator and drop it onto a target locator
 * @icon MOUSE
 */
When(
  'the user drags the {string} element onto the {string} element',
  async function (this: CustomWorld, sourceName: SelectorName, targetName: SelectorName) {
    const sourceSelector = await resolveLocator(this.page, sourceName)
    const targetSelector = await resolveLocator(this.page, targetName)
    if (!sourceSelector) throw new Error(`Selector ${sourceName} not found`)
    if (!targetSelector) throw new Error(`Selector ${targetName} not found`)
    await this.page.locator(sourceSelector).dragTo(this.page.locator(targetSelector))
  },
)
