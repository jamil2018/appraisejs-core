/**
 * @name store element text
 * @description Template step for storing element text inside a data variable to be referenced in later steps
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (
    this: CustomWorld,
    elementName: SelectorName,
    storeVariableName: string
  ) {
    const selector = await resolveLocator(this.page, elementName);
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`);
    }
    try {
      const text = await this.page.locator(selector).textContent();
      this.setVar(storeVariableName, text);
    } catch (error) {
      throw new Error(
        `Failed to store the ${elementName} element text: ${error}`
      );
    }
  }
);
