/**
 * @name Assert field value
 * @description Assert the exact value of a form control.
 * @icon VALIDATION
 */
Then(
  'the {string} input value should equal {string}',
  async function (this: CustomWorld, target: SelectorName, value: string) {
    await executeHumanOperation('browser.assertions.value@1', this, ['target', 'value'], [target, value])
  },
)
