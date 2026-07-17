/**
 * @name assert stored download filename
 * @description Assert the suggested filename on a stored Playwright download handle
 * @icon VALIDATION
 */
Then(
  'the download in variable {string} should have suggested filename {string}',
  async function (this: CustomWorld, variableName: string, expected: string) {
    const download = this.getVar<{ suggestedFilename(): string }>(variableName)
    if (!download || typeof download.suggestedFilename !== 'function') {
      throw new Error(`Stored variable ${variableName} does not contain a Playwright download`)
    }
    expect(download.suggestedFilename()).to.equal(expected)
  },
)
