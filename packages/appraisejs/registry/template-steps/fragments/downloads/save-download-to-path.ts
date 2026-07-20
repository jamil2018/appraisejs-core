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
