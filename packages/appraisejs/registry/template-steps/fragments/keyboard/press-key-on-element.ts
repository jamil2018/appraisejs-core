/**
 * @name press key on element
 * @description Press one key or a Playwright key combination while an element is targeted
 * @icon INPUT
 */
When(
  'the user presses the {string} key on the {string} element',
  async function (this: CustomWorld, key: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.keyboard.press.key.on.element@1',
      this,
      ['key', 'elementName'],
      [key, elementName],
    )
  },
)
