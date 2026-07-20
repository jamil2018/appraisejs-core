/**
 * @name wait for response
 * @description Wait for an HTTP response whose URL contains text and status equals the expected code
 * @icon WAIT
 */
When(
  'the user waits for a response url containing {string} with status {int}',
  async function (this: CustomWorld, urlPart: string, status: number) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.response@1',
      this,
      ['urlPart', 'status'],
      [urlPart, status],
    )
  },
)
