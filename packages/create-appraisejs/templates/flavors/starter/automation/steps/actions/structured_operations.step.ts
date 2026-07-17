import {
  When,
  CustomWorld,
  SelectorName,
  resolveLocator,
  runLocatorTemplateOperation,
  runPageTemplateOperation,
} from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name structured operations
 * @description Allowlisted Playwright locator and page operations using bounded JSON arguments and options
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
