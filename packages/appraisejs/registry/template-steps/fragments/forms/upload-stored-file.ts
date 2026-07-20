/**
 * @name upload stored file
 * @description Upload a file path read from a stored runtime variable
 * @icon UPLOAD
 */
When(
  'the user uploads the file path in variable {string} through the {string} input',
  async function (this: CustomWorld, variableName: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.upload.stored.file@1',
      this,
      ['variableName', 'elementName'],
      [variableName, elementName],
    )
  },
)
