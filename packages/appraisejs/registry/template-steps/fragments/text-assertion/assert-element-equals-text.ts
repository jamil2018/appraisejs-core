/**
 * @name assert element equals text
 * @description Template step for validating whether an element text equals a provided text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} equal the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldEqual: boolean, elementText: string) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const elementTextContent = await this.page.locator(selector).textContent()
      if (!elementTextContent) throw new Error(`Element ${elementName} does not have any text content`)
      if (shouldEqual) {
        expect(elementTextContent, `Expected ${elementName} to equal "${elementText}"`).to.equal(elementText)
      } else {
        expect(elementTextContent, `Expected ${elementName} NOT to equal "${elementText}"`).to.not.equal(elementText)
      }
    } catch (error) {
      throw new Error(`Failed to validate the equality of the text of the element ${elementName}: ${error}`)
    }
  },
)
