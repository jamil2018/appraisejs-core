/**
 * @name uncheck
 * @description Template step for unchecking a checkbox
 * @icon INPUT
 */
When('the user unchecks the {string} checkbox', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.input.uncheck@1', this, ['elementName'], [elementName])
})
