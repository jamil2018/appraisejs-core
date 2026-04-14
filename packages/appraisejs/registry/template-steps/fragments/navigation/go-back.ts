/**
 * @name go back
 * @description Template step for going back to the previous page
 * @icon NAVIGATION
 */
When('the user goes back to the previous page', async function (this: CustomWorld) {
  try {
    await this.page.goBack({ waitUntil: 'domcontentloaded' })
  } catch (error) {
    throw new Error(`Failed to go back to the previous page: ${error}`)
  }
})
