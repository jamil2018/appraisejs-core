/**
 * @name Press keyboard key
 * @description Press a portable Playwright keyboard key or chord.
 * @icon INPUT
 */
When('the user presses the keyboard shortcut {string}', async function (this: CustomWorld, key: string) {
  await executeHumanOperation('browser.keyboard.press@1', this, ['key'], [key])
})
