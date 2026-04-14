/**
 * @name assert element active
 * @description Template step for validating whether an element is active or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should have active status {boolean} ',
  async function (this: CustomWorld, elementName: SelectorName, isActive: boolean) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const elementActiveStatus = await this.page.locator(selector).isEnabled({ timeout: 10000 })
      if (isActive) {
        void expect(elementActiveStatus, `Expected ${elementName} to be active`).to.be.true
      } else {
        void expect(elementActiveStatus, `Expected ${elementName} NOT to be active`).to.be.false
      }
    } catch (error) {
      throw new Error(`Failed to validate the active status of the element ${elementName}: ${error}`)
    }
  },
)
