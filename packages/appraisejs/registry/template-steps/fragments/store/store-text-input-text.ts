/**
 * @name store text input text
 * @description Store a text input value inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} text input value inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.store.store.text.input.text@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)
