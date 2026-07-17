/**
 * @name wait for download event
 * @description Wait for the next download and store its Playwright handle for later save or inspection
 * @icon DOWNLOAD
 */
When(
  'the user waits for a download and stores it in {string}',
  async function (this: CustomWorld, variableName: string) {
    this.setVar(variableName, await this.page.waitForEvent('download'))
  },
)
