/**
 * @name Wait for duration
 * @description Wait for a bounded number of seconds.
 * @icon WAIT
 */
When('the user waits for {int} seconds', async function (this: CustomWorld, duration: number) {
  await executeHumanOperation('browser.waits.duration@1', this, ['duration'], [duration])
})
