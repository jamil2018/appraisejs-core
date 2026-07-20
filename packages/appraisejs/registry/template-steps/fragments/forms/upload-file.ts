/**
 * @name upload file
 * @description Upload a local file path through a file input element
 * @icon UPLOAD
 */
When(
  'the user uploads the file {string} through the {string} input',
  async function (this: CustomWorld, filePath: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.upload.file@1',
      this,
      ['filePath', 'elementName'],
      [filePath, elementName],
    )
  },
)
