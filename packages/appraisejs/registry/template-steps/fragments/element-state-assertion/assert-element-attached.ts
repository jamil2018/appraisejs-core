/**
 * @name assert element attached
 * @description Assert whether an element is attached to the DOM
 * @icon VALIDATION
 */
Then(
  'the {string} element attached status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.attached@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
