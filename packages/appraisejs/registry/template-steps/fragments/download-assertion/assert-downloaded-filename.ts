/**
 * @name assert downloaded filename
 * @description Assert a suggested download filename stored by a download action
 * @icon VALIDATION
 */
Then(
  'the downloaded filename in variable {string} should equal {string}',
  async function (this: CustomWorld, variableName: string, expected: string) {
    expect(this.getVar<unknown>(variableName)).to.equal(expected)
  },
)
