/**
 * @name navigate to environment base url
 * @description Navigate to the base url of the selected environment
 * @icon NAVIGATION
 */
When('the user navigates to the base url of the selected environment', async function (this: CustomWorld) {
  await executeHumanOperation('browser.navigation.navigate.to.environment.base.url@1', this, [], [])
})
