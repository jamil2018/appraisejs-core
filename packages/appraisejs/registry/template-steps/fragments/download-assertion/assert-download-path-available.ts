/**
 * @name assert download path available
 * @description Assert whether a stored local download path is available and non-empty
 * @icon VALIDATION
 */
Then(
  'the downloaded path in variable {string} should be available',
  async function (this: CustomWorld, variableName: string) {
    const value = this.getVar<unknown>(variableName)
    expect(typeof value === 'string' && value.length > 0).to.equal(true)
  },
)
