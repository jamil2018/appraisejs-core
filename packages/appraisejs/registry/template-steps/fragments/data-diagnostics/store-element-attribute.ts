/**
 * @name store element attribute
 * @description Store an element attribute value in a runtime variable
 * @icon STORE
 */
When(
  'the user stores attribute {string} from the {string} element in variable {string}',
  async function (this: CustomWorld, attribute: string, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.data.diagnostics.store.element.attribute@1',
      this,
      ['attribute', 'elementName', 'variableName'],
      [attribute, elementName, variableName],
    )
  },
)
