/**
 * @name wait for element
 * @description Template step for waiting for element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    try {
      const selector = await resolveLocator(this.page, elementName);
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`);
      }
      await this.page.waitForSelector(selector, { state: 'visible' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the element ${elementName} to become visible: ${error}`
      );
    }
  }
);
