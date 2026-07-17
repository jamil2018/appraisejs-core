/**
 * @name hold keyboard key down
 * @description Hold a keyboard key down until a matching key-up step is used
 * @icon INPUT
 */
When('the user holds the {string} keyboard key down', async function (this: CustomWorld, key: string) {
  await this.page.keyboard.down(key)
})
