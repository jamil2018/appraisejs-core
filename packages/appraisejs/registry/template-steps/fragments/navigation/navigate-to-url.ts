/**
 * @name Navigate to URL
 * @description Navigate to an absolute or environment-relative URL.
 * @icon NAVIGATION
 */
When('the user navigates to the {string} url', async function (this: CustomWorld, url: string) {
  await executeHumanOperation('browser.navigation.goto@1', this, ['url'], [url])
})
