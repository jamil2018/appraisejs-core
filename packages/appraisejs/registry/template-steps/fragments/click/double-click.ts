/**
 * @name double click
 * @description Template step for double clicking on an element
 * @icon MOUSE
 */
When('the user double clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.click.double.click@1', this, ['elementName'], [elementName])
})
