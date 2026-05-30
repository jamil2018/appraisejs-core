/**
 * @name wait for specific amount of seconds
 * @description Wait for a specific number of seconds
 * @icon WAIT
 */
When('the user waits for {int} seconds', async function (this: CustomWorld, seconds: number) {
  try {
    await this.page.waitForTimeout(seconds * 1000)
  } catch (error) {
    throw new Error(`Failed to wait for ${seconds} seconds: ${error}`)
  }
})
