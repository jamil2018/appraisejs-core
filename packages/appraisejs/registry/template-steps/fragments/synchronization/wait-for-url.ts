/**
 * @name wait for url
 * @description Wait until the current URL contains expected text
 * @icon WAIT
 */
When('the user waits for the url to contain {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.synchronization.wait.for.url@1', this, ['expected'], [expected])
})
