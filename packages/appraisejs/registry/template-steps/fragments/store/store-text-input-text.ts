/**
 * @name store text input text
 * @description Template step for storing text input element values inside a variable
 * @icon STORE
 */
When(
  'the user stores the {string} text input value inside the variable {string}',
  async function (
    this: CustomWorld,
    fieldName: SelectorName,
    variableName: string
  ) {
    const selector = await resolveLocator(this.page, fieldName);
    if (!selector) {
      throw new Error(`Selector ${fieldName} not found`);
    }
    try {
      const value = await this.page.locator(selector).inputValue();
      this.setVar(variableName, value);
    } catch (error) {
      throw new Error(
        `Failed to store the ${fieldName} text input value: ${error}`
      );
    }
  }
);
