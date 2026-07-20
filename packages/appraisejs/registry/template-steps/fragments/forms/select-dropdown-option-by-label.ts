/**
 * @name select dropdown option by label
 * @description Select a dropdown option using its visible label text
 * @icon INPUT
 */
When(
  'the user selects label {string} from the {string} dropdown',
  async function (this: CustomWorld, label: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.label@1',
      this,
      ['label', 'elementName'],
      [label, elementName],
    )
  },
)
