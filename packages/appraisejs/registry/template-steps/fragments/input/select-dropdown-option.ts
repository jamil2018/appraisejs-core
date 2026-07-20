/**
 * @name select dropdown option
 * @description Template step for selecting a particular option inside a dropdown element
 * @icon INPUT
 */
When(
  'the user selects the {string} option of the {string} dropdown',
  async function (this: CustomWorld, optionName: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.input.select.dropdown.option@1',
      this,
      ['optionName', 'elementName'],
      [optionName, elementName],
    )
  },
)
