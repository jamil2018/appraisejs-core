/**
 * @name assert element focused
 * @description Assert whether an element currently has document focus
 * @icon VALIDATION
 */
Then(
  'the {string} element focused status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.focused@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
