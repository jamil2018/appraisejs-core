/**
 * @name dismiss next dialog
 * @description Dismiss the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user dismisses the next browser dialog', async function (this: CustomWorld) {
  await executeHumanOperation('browser.tabs.frames.dialogs.dismiss.next.dialog@1', this, [], [])
})
