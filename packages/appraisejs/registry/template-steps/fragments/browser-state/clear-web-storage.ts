/**
 * @name clear web storage
 * @description Clear both localStorage and sessionStorage for the current page origin
 * @icon STORE
 */
When('the user clears local and session storage', async function (this: CustomWorld) {
  await this.page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
})
