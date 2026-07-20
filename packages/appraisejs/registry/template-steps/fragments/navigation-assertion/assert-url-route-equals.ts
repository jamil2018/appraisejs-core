/**
 * @name assert url route equals
 * @description Template step for validating whether a url route equals the provided value or not
 * @icon VALIDATION
 */
Then('the url route should be equal to {string}', async function (this: CustomWorld, route: string) {
  await executeHumanOperation('browser.navigation.assertion.assert.url.route.equals@1', this, ['route'], [route])
})
