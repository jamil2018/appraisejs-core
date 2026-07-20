/**
 * @name right click
 * @description Template step for right clicking on an element
 * @icon MOUSE
 */
When('the user right clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.click.right.click@1', this, ['elementName'], [elementName])
})
