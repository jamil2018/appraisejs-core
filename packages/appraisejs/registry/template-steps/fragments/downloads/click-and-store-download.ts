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
