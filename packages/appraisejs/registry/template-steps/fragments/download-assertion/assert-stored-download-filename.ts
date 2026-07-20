/**
 * @name assert stored download filename
 * @description Assert the suggested filename on a stored Playwright download handle
 * @icon VALIDATION
 */
Then(
  'the download in variable {string} should have suggested filename {string}',
  async function (this: CustomWorld, variableName: string, expected: string) {
    await executeHumanOperation(
      'browser.download.assertion.assert.stored.download.filename@1',
      this,
      ['variableName', 'expected'],
      [variableName, expected],
    )
  },
)
