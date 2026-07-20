/**
 * @name Reload page
 * @description Reload the current browser page.
 * @icon NAVIGATION
 */
When('the user reloads the page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.reload@1', this, [], [])
})
