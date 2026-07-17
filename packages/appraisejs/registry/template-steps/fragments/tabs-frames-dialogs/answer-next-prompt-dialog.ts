/**
 * @name answer next prompt dialog
 * @description Accept the next browser prompt dialog with supplied text
 * @icon INPUT
 */
When('the user answers the next browser prompt with {string}', async function (this: CustomWorld, value: string) {
  this.page.once('dialog', dialog => dialog.accept(value))
})
