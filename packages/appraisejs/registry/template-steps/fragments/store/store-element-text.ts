/**
 * @name store element text
 * @description Store an element's text content inside a runtime variable
 * @icon STORE
 */
When(
  'the user stores the {string} element text inside the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) {
      throw new Error(`Selector ${elementName} not found`)
    }

    try {
      const value = await this.page.locator(selector).textContent()
      this.setVar(variableName, value ?? '')
    } catch (error) {
      throw new Error(`Failed to store the ${elementName} element text inside the variable ${variableName}: ${error}`)
    }
  },
)
