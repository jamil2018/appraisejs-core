/**
 * @name Assert text
 * @description Assert that a resolved target contains expected text.
 * @icon VALIDATION
 */
Then(
  'the {string} element should contain the text {string}',
  async function (this: CustomWorld, target: SelectorName, text: string) {
    await executeHumanOperation('browser.assertions.text@1', this, ['target', 'text'], [target, text])
  },
)
