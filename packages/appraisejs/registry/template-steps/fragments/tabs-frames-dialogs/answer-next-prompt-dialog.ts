/**
 * @name answer next prompt dialog
 * @description Accept the next browser prompt dialog with supplied text
 * @icon INPUT
 */
When('the user answers the next browser prompt with {string}', async function (this: CustomWorld, value: string) {
  await executeHumanOperation('browser.tabs.frames.dialogs.answer.next.prompt.dialog@1', this, ['value'], [value])
})
