/**
 * @name store text input text
 * @description Store a text input value inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} text input value inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      const value = await this.page.locator(selector).inputValue()
      this.setVar(variableName, value)
    } catch (error) {
      throw new Error(
        `Failed to store the ${elementName} text input value inside the variable ${variableName}: ${error}`,
      )
    }
  },
)
