/**
 * @name wait for url
 * @description Wait until the current URL contains expected text
 * @icon WAIT
 */
When('the user waits for the url to contain {string}', async function (this: CustomWorld, expected: string) {
  await this.page.waitForURL(url => url.toString().includes(expected))
})
