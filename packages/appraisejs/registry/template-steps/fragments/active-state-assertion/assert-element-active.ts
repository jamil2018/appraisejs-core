/**
 * @name assert element active
 * @description Template step for validating whether an element is active or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should have active status {boolean} ',
  async function (this: CustomWorld, elementName: SelectorName, isActive: boolean) {
    await executeHumanOperation(
      'browser.active.state.assertion.assert.element.active@1',
      this,
      ['elementName', 'isActive'],
      [elementName, isActive],
    )
  },
)
