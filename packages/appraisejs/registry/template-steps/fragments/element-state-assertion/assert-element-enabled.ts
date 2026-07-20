/**
 * @name assert element enabled
 * @description Assert whether an element is enabled for interaction
 * @icon VALIDATION
 */
Then(
  'the {string} element enabled status should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
    await executeHumanOperation(
      'browser.element.state.assertion.assert.element.enabled@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
