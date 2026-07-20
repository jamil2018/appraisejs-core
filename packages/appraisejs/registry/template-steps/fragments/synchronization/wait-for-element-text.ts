/**
 * @name wait for element text
 * @description Wait until an element contains expected text
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to contain text {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedText: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.element.text@1',
      this,
      ['elementName', 'expectedText'],
      [elementName, expectedText],
    )
  },
)
