/**
 * @name wait for page load
 * @description Template step for waiting till page becomes interactive
 * @icon WAIT
 */
When(
  'the user waits for the current page to be loaded',
  async function (this: CustomWorld) {
    try {
      await this.page.waitForLoadState('domcontentloaded');
    } catch (error) {
      throw new Error(
        `Failed to wait for the current page to be loaded: ${error}`
      );
    }
  }
);
