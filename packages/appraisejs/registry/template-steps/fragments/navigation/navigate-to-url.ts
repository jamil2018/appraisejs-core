/**
 * @name navigate to url
 * @description Navigate to the specified URL
 * @icon NAVIGATION
 */
When('the user navigates to the {string} url', async function (this: CustomWorld, url: string) {
  try {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    throw new Error(`Failed to navigate to the ${url} url: ${error}`)
  }
})
