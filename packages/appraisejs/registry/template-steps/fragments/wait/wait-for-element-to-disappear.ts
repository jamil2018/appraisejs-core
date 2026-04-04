/**
 * @name wait for element to disappear
 * @description Template step for waiting for an element to disappear from viewport
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    try {
      const selector = await resolveLocator(this.page, elementName);
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`);
      }
      await this.page.waitForSelector(selector, { state: 'hidden' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the ${elementName} element to disappear: ${error}`
      );
    }
  }
);
