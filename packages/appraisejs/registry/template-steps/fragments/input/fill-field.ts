/**
 * @name Fill field
 * @description Replace a field value through a resolved locator.
 * @icon INPUT
 */
When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, target: SelectorName, value: string) {
    await executeHumanOperation('browser.forms.fill@1', this, ['target', 'value'], [target, value])
  },
)
