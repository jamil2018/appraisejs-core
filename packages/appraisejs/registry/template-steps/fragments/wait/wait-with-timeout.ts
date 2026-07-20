/**
 * @name Wait with timeout
 * @description Wait using a bounded millisecond timeout.
 * @icon WAIT
 */
When('the user waits for {int} milliseconds', async function (this: CustomWorld, timeout: number) {
  await executeHumanOperation('browser.waits.timeout@1', this, ['timeout'], [timeout])
})
