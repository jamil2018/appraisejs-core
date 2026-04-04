/**
 * @name reload
 * @description Template step for reloading the current page
 * @icon NAVIGATION
 */
When('the user reloads the page', async function (this: CustomWorld) {
  try {
    await this.page.reload()
    await this.page.waitForLoadState('domcontentloaded')
  } catch (error) {
    throw new Error(`Failed to reload the page: ${error}`)
  }
})
