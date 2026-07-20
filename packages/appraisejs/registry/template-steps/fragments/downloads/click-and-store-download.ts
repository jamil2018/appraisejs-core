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
