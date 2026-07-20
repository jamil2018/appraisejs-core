/**
 * @name go forward
 * @description Navigate forward to the next page in browser history
 * @icon NAVIGATION
 */
When('the user goes forward to the next page', async function (this: CustomWorld) {
  await executeHumanOperation('browser.browser.state.go.forward@1', this, [], [])
})
