/**
 * @name navigate to stored url
 * @description Navigate to a URL read from a stored runtime variable
 * @icon NAVIGATION
 */
When('the user navigates to the url in variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.browser.state.navigate.to.stored.url@1', this, ['variableName'], [variableName])
})
