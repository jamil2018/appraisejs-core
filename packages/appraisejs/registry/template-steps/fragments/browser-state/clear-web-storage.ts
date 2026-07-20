/**
 * @name clear web storage
 * @description Clear both localStorage and sessionStorage for the current page origin
 * @icon STORE
 */
When('the user clears local and session storage', async function (this: CustomWorld) {
  await executeHumanOperation('browser.browser.state.clear.web.storage@1', this, [], [])
})
