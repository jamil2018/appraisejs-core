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
