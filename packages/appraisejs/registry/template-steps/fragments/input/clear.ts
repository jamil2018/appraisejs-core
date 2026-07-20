/**
 * @name clear
 * @description Template step for clearing an input field
 * @icon INPUT
 */
When('the user clears the {string} field', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.clear@1', this, ['elementName'], [elementName])
})
