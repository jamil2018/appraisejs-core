/**
 * @name assert element contains text
 * @description Template step for validating whether an element contains a certain text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} contain the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldContain: boolean, elementText: string) {
    await executeHumanOperation(
      'browser.assertions.text-contains@1',
      this,
      ['elementName', 'shouldContain', 'elementText'],
      [elementName, shouldContain, elementText],
    )
  },
)
