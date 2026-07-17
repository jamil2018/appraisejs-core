/**
 * @name run structured page operation
 * @description Run an allowlisted uncommon page operation with JSON argument array, JSON options object, and {"$stored":"name"} value references; arbitrary JavaScript is forbidden
 * @icon DEBUG
 */
When(
  'the user runs page operation {string} with arguments {string} and options {string}',
  async function (this: CustomWorld, operation: string, argumentsJson: string, optionsJson: string) {
    try {
      await runPageTemplateOperation(this.page, operation, argumentsJson, optionsJson, name => this.getVar(name))
    } catch (error) {
      throw new Error(`Structured page operation ${operation} failed: ${error}`)
    }
  },
)
