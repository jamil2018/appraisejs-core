/**
 * @name capture element screenshot
 * @description Capture an element screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a screenshot of the {string} element in the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const screenshot = await this.page.locator(selector).screenshot()
    this.setVar(variableName, screenshot.toString('base64'))
  },
)
