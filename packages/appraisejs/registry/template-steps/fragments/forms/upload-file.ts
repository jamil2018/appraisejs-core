/**
 * @name upload file
 * @description Upload a local file path through a file input element
 * @icon UPLOAD
 */
When(
  'the user uploads the file {string} through the {string} input',
  async function (this: CustomWorld, filePath: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).setInputFiles(filePath)
  },
)
