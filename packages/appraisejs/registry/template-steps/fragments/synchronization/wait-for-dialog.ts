/**
 * @name wait for dialog
 * @description Wait for the next browser dialog and store its message in a runtime variable
 * @icon WAIT
 */
When(
  'the user waits for a dialog and stores its message in {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation('browser.synchronization.wait.for.dialog@1', this, ['variableName'], [variableName])
  },
)
