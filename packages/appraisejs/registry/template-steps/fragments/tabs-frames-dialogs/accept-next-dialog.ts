/**
 * @name accept next dialog
 * @description Accept the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user accepts the next browser dialog', async function (this: CustomWorld) {
  this.page.once('dialog', dialog => dialog.accept())
})
