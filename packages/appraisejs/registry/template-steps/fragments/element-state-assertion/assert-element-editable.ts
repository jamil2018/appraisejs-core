/**
 * @name assert element editable
 * @description Assert whether an input or content-editable element is editable
 * @icon VALIDATION
 */
Then(
  'the {string} element editable status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.editable@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
