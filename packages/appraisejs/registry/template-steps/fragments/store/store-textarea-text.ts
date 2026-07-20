/**
 * @name store textarea text
 * @description Store a textarea value inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} textarea input value inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.store.store.textarea.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
