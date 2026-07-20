/**
 * @name Wait for page
 * @description Wait for the current page load state.
 * @icon WAIT
 */
When('the user waits for the current page to be loaded', async function (this: CustomWorld) {
  await executeHumanOperation('browser.waits.page-ready@1', this, [], [])
})
