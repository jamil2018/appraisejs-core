/**
 * @name scroll element into view
 * @description Scroll until the target element is inside the viewport
 * @icon MOUSE
 */
When('the user scrolls the {string} element into view', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.scroll.element.into.view@1', this, ['elementName'], [elementName])
})
