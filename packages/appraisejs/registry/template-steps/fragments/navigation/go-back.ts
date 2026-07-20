/**
 * @name go back
 * @description Template step for going back to the previous page
 * @icon NAVIGATION
 */
When('the user goes back to the previous page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.go.back@1', this, [], [])
})
