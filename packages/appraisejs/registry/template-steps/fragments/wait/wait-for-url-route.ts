/**
 * @name wait for url route
 * @description Wait for the current URL path to match a route
 * @icon WAIT
 */
When('the user waits for the route {string} to be loaded', async function (this: CustomWorld, route: string) {
  await executeHumanOperation('browser.wait.wait.for.url.route@1', this, ['route'], [route])
})
