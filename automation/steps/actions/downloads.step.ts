import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name downloads
 * @description Download event handling, suggested filenames, and stored download paths
 * @type ACTION
 */

/**
 * @name click and wait for download
 * @description Click an element, wait for its download, and store the suggested filename and local path
 * @icon DOWNLOAD
 */
When(
  'the user clicks the {string} element and stores the download filename in {string} and path in {string}',
  async function (this: CustomWorld, elementName: SelectorName, filenameVariable: string, pathVariable: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const [download] = await Promise.all([this.page.waitForEvent('download'), this.page.locator(selector).click()])
    const failure = await download.failure()
    if (failure) throw new Error(`Download failed: ${failure}`)
    this.setVar(filenameVariable, download.suggestedFilename())
    this.setVar(pathVariable, (await download.path()) ?? '')
  },
)

/**
 * @name click and store download
 * @description Click an element, wait for its download, and store the Playwright download handle for later save or assertion
 * @icon DOWNLOAD
 */
When(
  'the user clicks the {string} element and stores the download in {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    const [download] = await Promise.all([this.page.waitForEvent('download'), this.page.locator(selector).click()])
    this.setVar(variableName, download)
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
    const download = this.getVar<{ saveAs(path: string): Promise<void> }>(downloadVariable)
    if (!download || typeof download.saveAs !== 'function') {
      throw new Error(`Stored variable ${downloadVariable} does not contain a Playwright download`)
    }
    await download.saveAs(targetPath)
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
    this.setVar(variableName, await this.page.waitForEvent('download'))
  },
)
