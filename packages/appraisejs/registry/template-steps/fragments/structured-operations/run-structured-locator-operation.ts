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
    await executeHumanOperation(
      'browser.structured.operations.run.structured.locator.operation@1',
      this,
      ['operation', 'elementName', 'argumentsJson', 'optionsJson'],
      [operation, elementName, argumentsJson, optionsJson],
    )
  },
)
