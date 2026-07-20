/**
 * @name close current browser tab
 * @description Close the current tab and switch to the last remaining browser tab
 * @icon NAVIGATION
 */
When('the user closes the current browser tab', async function (this: CustomWorld) {
  await executeHumanOperation('browser.tabs.frames.dialogs.close.current.browser.tab@1', this, [], [])
})
