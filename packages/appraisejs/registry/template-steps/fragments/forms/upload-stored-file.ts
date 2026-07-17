/**
 * @name upload stored file
 * @description Upload a file path read from a stored runtime variable
 * @icon UPLOAD
 */
When(
  'the user uploads the file path in variable {string} through the {string} input',
  async function (this: CustomWorld, variableName: string, elementName: SelectorName) {
    const filePath = this.getVar<unknown>(variableName)
    if (typeof filePath !== 'string') throw new Error(`Stored variable ${variableName} must contain a file path string`)
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).setInputFiles(filePath)
  },
)
