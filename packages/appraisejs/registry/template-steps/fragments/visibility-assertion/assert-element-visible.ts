/**
 * @name assert element visible
 * @description Template step for validating whether an element should be visible or not
 * @icon VALIDATION
 */
Then(
  'the visibility status of the {string} element should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, isVisible: boolean) {
    await executeHumanOperation(
      'browser.assertions.visibility@1',
      this,
      ['elementName', 'isVisible'],
      [elementName, isVisible],
    )
  },
)
