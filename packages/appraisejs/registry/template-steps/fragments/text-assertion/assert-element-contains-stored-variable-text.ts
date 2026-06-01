/**
 * @name assert element contains stored variable text
 * @description Template step to validate whether an element text contains the text inside a stored variable
 * @icon VALIDATION
 */
Then(
  'the element {string} should contain the text inside the stored variable {string}',
  async function (this: CustomWorld, _elementName: SelectorName, _variableName: string) {},
)
