/**
 * @name select dropdown option by value
 * @description Select a dropdown option using its HTML value
 * @icon INPUT
 */
When(
  'the user selects value {string} from the {string} dropdown',
  async function (this: CustomWorld, value: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.value@1',
      this,
      ['value', 'elementName'],
      [value, elementName],
    )
  },
)
