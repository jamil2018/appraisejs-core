/**
 * @name Focus element
 * @description Move keyboard focus to a resolved locator.
 * @icon MOUSE
 */
When('the user focuses the {string} element', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.keyboard.focus@1', this, ['target'], [target])
})
