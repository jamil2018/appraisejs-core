/**
 * @name select dropdown option by index
 * @description Select a dropdown option using its zero-based index
 * @icon INPUT
 */
When(
  'the user selects option index {int} from the {string} dropdown',
  async function (this: CustomWorld, index: number, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.index@1',
      this,
      ['index', 'elementName'],
      [index, elementName],
    )
  },
)
