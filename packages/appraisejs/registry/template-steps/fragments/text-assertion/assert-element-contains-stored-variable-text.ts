/**
 * @name assert element contains stored variable text
 * @description Template step to validate whether an element text contains the text inside a stored variable
 * @icon VALIDATION
 */
Then(
  'the element {string} should contain the text inside the stored variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    const expectedText = this.getVar<unknown>(variableName)
    if (typeof expectedText !== 'string') {
      throw new Error(`Stored variable ${variableName} must contain a string`)
    }

    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)

    try {
      const actualText = await this.page.locator(selector).textContent()
      expect(actualText ?? '', `Expected ${elementName} to contain stored variable ${variableName}`).to.contain(
        expectedText,
      )
    } catch (error) {
      throw new Error(`Failed to compare ${elementName} text with stored variable ${variableName}: ${error}`)
    }
  },
)
