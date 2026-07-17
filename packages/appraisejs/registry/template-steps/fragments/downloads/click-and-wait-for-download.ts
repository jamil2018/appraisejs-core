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
