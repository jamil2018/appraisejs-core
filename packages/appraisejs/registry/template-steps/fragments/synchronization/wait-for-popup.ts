/**
 * @name wait for popup
 * @description Wait for a popup event and store the opened page in a runtime variable
 * @icon WAIT
 */
When('the user waits for a popup and stores it in {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.synchronization.wait.for.popup@1', this, ['variableName'], [variableName])
})
