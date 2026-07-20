/**
 * @name assert downloaded filename
 * @description Assert a suggested download filename stored by a download action
 * @icon VALIDATION
 */
Then(
  'the downloaded filename in variable {string} should equal {string}',
  async function (this: CustomWorld, variableName: string, expected: string) {
    await executeHumanOperation(
      'browser.download.assertion.assert.downloaded.filename@1',
      this,
      ['variableName', 'expected'],
      [variableName, expected],
    )
  },
)
