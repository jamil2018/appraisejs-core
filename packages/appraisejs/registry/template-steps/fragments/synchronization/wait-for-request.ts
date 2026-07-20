/**
 * @name wait for request
 * @description Wait for an outgoing HTTP request whose URL contains expected text
 * @icon WAIT
 */
When('the user waits for a request url containing {string}', async function (this: CustomWorld, urlPart: string) {
  await executeHumanOperation('browser.synchronization.wait.for.request@1', this, ['urlPart'], [urlPart])
})
