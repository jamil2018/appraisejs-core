/**
 * @name Assert checked state
 * @description Assert the exact checked state of a form control.
 * @icon VALIDATION
 */
Then(
  'the {string} element checked status should be {boolean}',
  async function (this: CustomWorld, target: SelectorName, checked: boolean) {
    await executeHumanOperation('browser.assertions.checked@1', this, ['target', 'checked'], [target, checked])
  },
)
