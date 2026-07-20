/**
 * @name assert element count
 * @description Assert the number of elements matched by a locator
 * @icon VALIDATION
 */
Then(
  'the {string} locator should match {int} elements',
  async function (this: CustomWorld, elementName: SelectorName, expected: number) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.count@1',
      this,
      ['elementName', 'expected'],
      [elementName, expected],
    )
  },
)
