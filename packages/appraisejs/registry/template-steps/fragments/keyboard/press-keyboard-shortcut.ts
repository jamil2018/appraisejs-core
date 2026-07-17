/**
 * @name press keyboard shortcut
 * @description Press a page-level keyboard shortcut such as Control+A or Meta+Shift+P
 * @icon INPUT
 */
When('the user presses the keyboard shortcut {string}', async function (this: CustomWorld, shortcut: string) {
  await this.page.keyboard.press(shortcut)
})
