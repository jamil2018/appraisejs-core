/**
 * @name assert element contains stored variable text
 * @description Template step to validate whether an element text contains the text inside a stored variable
 * @icon VALIDATION
 */
Then(
  'the element {string} should contain the text inside the stored variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.text.assertion.assert.element.contains.stored.variable.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
