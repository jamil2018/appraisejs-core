/**
 * @name wait for input value
 * @description Wait until an input element equals an expected value
 * @icon WAIT
 */
When(
  'the user waits for the {string} input value to equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedValue: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.input.value@1',
      this,
      ['elementName', 'expectedValue'],
      [elementName, expectedValue],
    )
  },
)
