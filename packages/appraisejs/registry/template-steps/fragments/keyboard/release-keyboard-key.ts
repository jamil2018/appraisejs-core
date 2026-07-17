/**
 * @name release keyboard key
 * @description Release a keyboard key that was held down
 * @icon INPUT
 */
When('the user releases the {string} keyboard key', async function (this: CustomWorld, key: string) {
  await this.page.keyboard.up(key)
})
