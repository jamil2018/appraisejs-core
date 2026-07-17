/**
 * @name run structured locator operation
 * @description Run an allowlisted uncommon locator operation with JSON argument array, JSON options object, and {"$stored":"name"} value references; arbitrary JavaScript is forbidden
 * @icon DEBUG
 */
When(
  'the user runs locator operation {string} on the {string} element with arguments {string} and options {string}',
  async function (
    this: CustomWorld,
    operation: string,
    elementName: SelectorName,
    argumentsJson: string,
    optionsJson: string,
  ) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    try {
      await runLocatorTemplateOperation(this.page.locator(selector), operation, argumentsJson, optionsJson, name =>
        this.getVar(name),
      )
    } catch (error) {
      throw new Error(`Structured locator operation ${operation} failed for ${elementName}: ${error}`)
    }
  },
)
