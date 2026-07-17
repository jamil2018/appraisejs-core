/**
 * @name capture page screenshot
 * @description Capture a full-page screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a full page screenshot in variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const screenshot = await this.page.screenshot({ fullPage: true })
    this.setVar(variableName, screenshot.toString('base64'))
  },
)
