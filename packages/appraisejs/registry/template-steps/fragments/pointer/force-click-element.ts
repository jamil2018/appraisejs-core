/**
 * @name force click element
 * @description Force click an element when actionability checks must be bypassed deliberately
 * @icon MOUSE
 */
When('the user force clicks the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.force.click.element@1', this, ['elementName'], [elementName])
})
