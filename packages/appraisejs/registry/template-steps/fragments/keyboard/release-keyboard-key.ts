/**
 * @name release keyboard key
 * @description Release a keyboard key that was held down
 * @icon INPUT
 */
When('the user releases the {string} keyboard key', async function (this: CustomWorld, key: string) {
  await executeHumanOperation('browser.keyboard.release.keyboard.key@1', this, ['key'], [key])
})
