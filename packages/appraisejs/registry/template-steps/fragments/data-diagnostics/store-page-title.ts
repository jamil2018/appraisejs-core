/**
 * @name store page title
 * @description Store the current browser page title in a runtime variable
 * @icon STORE
 */
When('the user stores the page title in variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.data.diagnostics.store.page.title@1', this, ['variableName'], [variableName])
})
