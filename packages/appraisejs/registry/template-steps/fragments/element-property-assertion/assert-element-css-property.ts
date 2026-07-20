/**
 * @name assert element css property
 * @description Assert a computed CSS property value for an element
 * @icon VALIDATION
 */
Then(
  'the {string} element css property {string} should equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, property: string, expected: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.css.property@1',
      this,
      ['elementName', 'property', 'expected'],
      [elementName, property, expected],
    )
  },
)
