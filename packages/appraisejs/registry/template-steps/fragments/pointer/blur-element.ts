/**
 * @name blur element
 * @description Remove keyboard focus from an element
 * @icon MOUSE
 */
When('the user blurs the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.blur.element@1', this, ['elementName'], [elementName])
})
