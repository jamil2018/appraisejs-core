/**
 * @name fill content editable element
 * @description Fill a contenteditable rich-text element with text
 * @icon INPUT
 */
When(
  'the user fills the content editable {string} element with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    await executeHumanOperation(
      'browser.forms.fill.content.editable.element@1',
      this,
      ['elementName', 'value'],
      [elementName, value],
    )
  },
)
