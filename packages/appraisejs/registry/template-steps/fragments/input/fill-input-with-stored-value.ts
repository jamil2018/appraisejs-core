/**
 * @name fill input with stored value
 * @description Template step for filling an input field with data from a stored variable
 * @icon INPUT
 */
When(
  'the user fills in the {string} input with data from the stored variable {string}',
  async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.input.fill.input.with.stored.value@1',
      this,
      ['fieldName', 'variableName'],
      [fieldName, variableName],
    )
  },
)
