/**
 * @name assert download path available
 * @description Assert whether a stored local download path is available and non-empty
 * @icon VALIDATION
 */
Then(
  'the downloaded path in variable {string} should be available',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.download.assertion.assert.download.path.available@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)
