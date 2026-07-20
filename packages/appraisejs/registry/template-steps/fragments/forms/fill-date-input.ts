/**
 * @name fill date input
 * @description Fill a date or datetime input with an ISO-compatible value
 * @icon INPUT
 */
When(
  'the user fills the {string} date input with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    await executeHumanOperation('browser.forms.fill.date.input@1', this, ['elementName', 'value'], [elementName, value])
  },
)
