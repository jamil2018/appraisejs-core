/**
 * @name run structured page operation
 * @description Run an allowlisted uncommon page operation with JSON argument array, JSON options object, and {"$stored":"name"} value references; arbitrary JavaScript is forbidden
 * @icon DEBUG
 */
When(
  'the user runs page operation {string} with arguments {string} and options {string}',
  async function (this: CustomWorld, operation: string, argumentsJson: string, optionsJson: string) {
    await executeHumanOperation(
      'browser.structured.operations.run.structured.page.operation@1',
      this,
      ['operation', 'argumentsJson', 'optionsJson'],
      [operation, argumentsJson, optionsJson],
    )
  },
)
