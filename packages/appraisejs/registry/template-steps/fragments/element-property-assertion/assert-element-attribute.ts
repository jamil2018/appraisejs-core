/**
 * @name assert element attribute
 * @description Assert an element attribute exactly, using an empty string for a missing attribute
 * @icon VALIDATION
 */
Then(
  'the {string} element attribute {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, attribute: string, expected: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.attribute@1',
      this,
      ['elementName', 'attribute', 'expected'],
      [elementName, attribute, expected],
    )
  },
)
