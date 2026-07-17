import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name download assertion
 * @description Suggested filename, saved path, and download failure assertions for stored download results
 * @type VALIDATION
 */

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
