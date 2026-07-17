/**
 * @name clear browser cookies
 * @description Clear every cookie in the current browser context
 * @icon DATA
 */
When('the user clears all browser cookies', async function (this: CustomWorld) {
  await this.context.clearCookies()
})
