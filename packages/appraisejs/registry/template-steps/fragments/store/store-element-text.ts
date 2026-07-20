/**
 * @name store element text
 * @description Store an element's text content inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.store.store.element.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
