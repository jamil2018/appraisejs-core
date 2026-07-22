import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name structured operations
 * @description Generated human projections for canonical structured operations operations
 * @type ACTION
 */

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
