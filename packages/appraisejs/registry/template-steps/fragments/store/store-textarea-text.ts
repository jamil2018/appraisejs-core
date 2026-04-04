/**
 * @name store textarea text
 * @description Template step for storing textarea content inside a variable
 * @icon STORE
 */
When(
  'the user stores the {string} textarea input value inside the variable {string}',
  async function (
    this: CustomWorld,
    elementName: SelectorName,
    variableName: string
  ) {
    const selector = await resolveLocator(this.page, elementName);
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`);
    }
    try {
      const text = await this.page.locator(selector).inputValue();
      this.setVar(variableName, text);
    } catch (error) {
      throw new Error(`Failed to store the ${elementName} textarea input value inside the variable ${variableName}: ${error}`);
    }
  }
);
