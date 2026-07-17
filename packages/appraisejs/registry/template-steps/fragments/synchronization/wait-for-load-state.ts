/**
 * @name wait for load state
 * @description Wait for load, domcontentloaded, or networkidle page state
 * @icon WAIT
 */
When('the user waits for page load state {string}', async function (this: CustomWorld, state: string) {
  if (!['load', 'domcontentloaded', 'networkidle'].includes(state)) {
    throw new Error(`Unsupported page load state: ${state}`)
  }
  await this.page.waitForLoadState(state as 'load' | 'domcontentloaded' | 'networkidle')
})
