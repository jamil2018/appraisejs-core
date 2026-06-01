/**
 * @name wait for url route
 * @description Wait for the current URL path to match a route
 * @icon WAIT
 */
When('the user waits for the route {string} to be loaded', async function (this: CustomWorld, route: string) {
  try {
    await this.page.waitForURL(url => url.pathname === route || url.pathname.endsWith(route))
  } catch (error) {
    throw new Error(`Failed to wait for the route ${route} to be loaded: ${error}`)
  }
})
