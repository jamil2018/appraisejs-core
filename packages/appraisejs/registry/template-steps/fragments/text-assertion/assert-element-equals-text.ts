/**
 * @name assert element equals text
 * @description Template step for validating whether an element text equals a provided text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} equal the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldEqual: boolean, elementText: string) {
    await executeHumanOperation(
      'browser.text.assertion.assert.element.equals.text@1',
      this,
      ['elementName', 'shouldEqual', 'elementText'],
      [elementName, shouldEqual, elementText],
    )
  },
)
