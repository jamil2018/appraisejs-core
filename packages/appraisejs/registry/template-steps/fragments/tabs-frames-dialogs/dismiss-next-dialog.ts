/**
 * @name dismiss next dialog
 * @description Dismiss the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user dismisses the next browser dialog', async function (this: CustomWorld) {
  this.page.once('dialog', dialog => dialog.dismiss())
})
