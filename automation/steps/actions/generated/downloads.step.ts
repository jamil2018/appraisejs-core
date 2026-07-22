import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name downloads
 * @description Generated human projections for canonical downloads operations
 * @type ACTION
 */

/**
 * @name click and store download
 * @description Click an element, wait for its download, and store the Playwright download handle for later save or assertion
 * @icon DOWNLOAD
 */
When(
  'the user clicks the {string} element and stores the download in {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.downloads.click.and.store.download@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)

/**
 * @name click and wait for download
 * @description Click an element, wait for its download, and store the suggested filename and local path
 * @icon DOWNLOAD
 */
When(
  'the user clicks the {string} element and stores the download filename in {string} and path in {string}',
  async function (this: CustomWorld, elementName: SelectorName, filenameVariable: string, pathVariable: string) {
    await executeHumanOperation(
      'browser.downloads.click.and.wait.for.download@1',
      this,
      ['elementName', 'filenameVariable', 'pathVariable'],
      [elementName, filenameVariable, pathVariable],
    )
  },
)

/**
 * @name save download to path
 * @description Save the most recently captured Playwright download handle to a file path
 * @icon DOWNLOAD
 */
When(
  'the user saves the download in variable {string} to {string}',
  async function (this: CustomWorld, downloadVariable: string, targetPath: string) {
    await executeHumanOperation(
      'browser.downloads.save.download.to.path@1',
      this,
      ['downloadVariable', 'targetPath'],
      [downloadVariable, targetPath],
    )
  },
)

/**
 * @name wait for download event
 * @description Wait for the next download and store its Playwright handle for later save or inspection
 * @icon DOWNLOAD
 */
When(
  'the user waits for a download and stores it in {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation('browser.downloads.wait.for.download.event@1', this, ['variableName'], [variableName])
  },
)
