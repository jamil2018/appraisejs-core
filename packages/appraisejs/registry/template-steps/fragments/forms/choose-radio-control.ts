/**
 * @name choose radio control
 * @description Check a radio button or radio control element
 * @icon INPUT
 */
When('the user chooses the {string} radio control', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.forms.choose.radio.control@1', this, ['elementName'], [elementName])
})
