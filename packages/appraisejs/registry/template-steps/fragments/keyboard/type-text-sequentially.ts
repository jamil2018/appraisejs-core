/**
 * @name type text sequentially
 * @description Type text into an element one key at a time with a delay in milliseconds
 * @icon INPUT
 */
When(
  'the user types {string} sequentially into the {string} element with delay {int} milliseconds',
  async function (this: CustomWorld, value: string, elementName: SelectorName, delay: number) {
    await executeHumanOperation(
      'browser.keyboard.type.text.sequentially@1',
      this,
      ['value', 'elementName', 'delay'],
      [value, elementName, delay],
    )
  },
)
