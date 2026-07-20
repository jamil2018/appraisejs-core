/**
 * @name wait for load state
 * @description Wait for load, domcontentloaded, or networkidle page state
 * @icon WAIT
 */
When('the user waits for page load state {string}', async function (this: CustomWorld, state: string) {
  await executeHumanOperation('browser.synchronization.wait.for.load.state@1', this, ['state'], [state])
})
