/**
 * @name capture element screenshot
 * @description Capture an element screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a screenshot of the {string} element in the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.pointer.capture.element.screenshot@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
