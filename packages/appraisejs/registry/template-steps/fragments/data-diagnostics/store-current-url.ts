/**
 * @name store current url
 * @description Store the current browser page URL in a runtime variable
 * @icon STORE
 */
When('the user stores the current url in variable {string}', async function (this: CustomWorld, variableName: string) {
  this.setVar(variableName, this.page.url())
})
