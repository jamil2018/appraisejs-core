/**
 * @name store page title
 * @description Store the current browser page title in a runtime variable
 * @icon STORE
 */
When('the user stores the page title in variable {string}', async function (this: CustomWorld, variableName: string) {
  this.setVar(variableName, await this.page.title())
})
