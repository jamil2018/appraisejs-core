import { CustomWorld, Then, executeHumanOperation } from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name download assertion
 * @description Generated human projections for canonical download assertion operations
 * @type VALIDATION
 */

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
