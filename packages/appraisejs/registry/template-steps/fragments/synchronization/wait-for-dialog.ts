/**
 * @name wait for dialog
 * @description Wait for the next browser dialog and store its message in a runtime variable
 * @icon WAIT
 */
When(
  'the user waits for a dialog and stores its message in {string}',
  async function (this: CustomWorld, variableName: string) {
    const dialog = await this.page.waitForEvent('dialog')
    this.setVar(variableName, dialog.message())
    await dialog.dismiss()
  },
)
