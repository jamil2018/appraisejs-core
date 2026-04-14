/**
 * @name wait for specific amount of seconds
 * @description Template step for waiting for for an specific amount of seconds before proceeding with next action
 * @icon WAIT
 */
When(
  'the user waits for {int} seconds',
  async function (this: CustomWorld, waitTimeInSeconds: number) {
    try {
      await this.page.waitForTimeout(waitTimeInSeconds * 1000);
    } catch (error) {
      throw new Error(
        `Failed to wait for ${waitTimeInSeconds} seconds: ${error}`
      );
    }
  }
);
