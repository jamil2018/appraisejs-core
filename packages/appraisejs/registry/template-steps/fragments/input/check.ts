/**
 * @name check
 * @description Template step for checking a checkbox
 * @icon INPUT
 */
When('the user checks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.check@1', this, ['elementName'], [elementName])
})
