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
