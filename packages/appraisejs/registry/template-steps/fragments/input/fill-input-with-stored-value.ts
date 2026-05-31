/**
 * @name fill input with stored value
 * @description Template step for filling an input field with data from a stored variable
 * @icon INPUT
 */
When(
  'the user fills in the {string} input with data from the stored variable {string}',
  async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
    const value = this.getVar<string>(variableName)
    if (!value) {
      throw new Error(`Variable ${variableName} not found`)
    }
    const selector = await resolveLocator(this.page, fieldName)
    if (!selector) {
      throw new Error(`Selector ${fieldName} not found`)
    }
    try {
      await this.page.locator(selector).fill(value)
    } catch (error) {
      throw new Error(
        `Failed to fill in the ${fieldName} input field with data from the stored variable ${variableName}: ${error}`,
      )
    }
  },
)
