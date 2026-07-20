/**
 * @name Click element
 * @description Click a resolved locator target.
 * @icon MOUSE
 */
When('the user clicks on the {string} element', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.mouse.click@1', this, ['target'], [target])
})
