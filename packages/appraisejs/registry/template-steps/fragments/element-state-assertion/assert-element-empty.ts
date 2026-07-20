/**
 * @name assert element empty
 * @description Assert whether an input value or element text is empty
 * @icon VALIDATION
 */
Then(
  'the {string} element empty status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.empty@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
