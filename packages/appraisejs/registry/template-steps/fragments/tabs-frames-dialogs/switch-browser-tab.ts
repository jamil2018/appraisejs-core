/**
 * @name switch browser tab
 * @description Switch to a browser tab or popup using its zero-based index
 * @icon NAVIGATION
 */
When('the user switches to browser tab {int}', async function (this: CustomWorld, index: number) {
  await executeHumanOperation('browser.tabs.frames.dialogs.switch.browser.tab@1', this, ['index'], [index])
})
