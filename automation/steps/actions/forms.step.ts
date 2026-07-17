import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name forms
 * @description Form controls, radio buttons, dropdowns, dates, content-editable fields, and uploads
 * @type ACTION
 */

/**
 * @name choose radio control
 * @description Check a radio button or radio control element
 * @icon INPUT
 */
When('the user chooses the {string} radio control', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  if (!selector) throw new Error(`Selector ${elementName} not found`)
  await this.page.locator(selector).check()
})

/**
 * @name select dropdown option by label
 * @description Select a dropdown option using its visible label text
 * @icon INPUT
 */
When(
  'the user selects label {string} from the {string} dropdown',
  async function (this: CustomWorld, label: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ label })
  },
)

/**
 * @name select dropdown option by value
 * @description Select a dropdown option using its HTML value
 * @icon INPUT
 */
When(
  'the user selects value {string} from the {string} dropdown',
  async function (this: CustomWorld, value: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ value })
  },
)

/**
 * @name select dropdown option by index
 * @description Select a dropdown option using its zero-based index
 * @icon INPUT
 */
When(
  'the user selects option index {int} from the {string} dropdown',
  async function (this: CustomWorld, index: number, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).selectOption({ index })
  },
)

/**
 * @name fill date input
 * @description Fill a date or datetime input with an ISO-compatible value
 * @icon INPUT
 */
When(
  'the user fills the {string} date input with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).fill(value)
  },
)

/**
 * @name fill content editable element
 * @description Fill a contenteditable rich-text element with text
 * @icon INPUT
 */
When(
  'the user fills the content editable {string} element with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).fill(value)
  },
)

/**
 * @name upload file
 * @description Upload a local file path through a file input element
 * @icon UPLOAD
 */
When(
  'the user uploads the file {string} through the {string} input',
  async function (this: CustomWorld, filePath: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).setInputFiles(filePath)
  },
)

/**
 * @name upload stored file
 * @description Upload a file path read from a stored runtime variable
 * @icon UPLOAD
 */
When(
  'the user uploads the file path in variable {string} through the {string} input',
  async function (this: CustomWorld, variableName: string, elementName: SelectorName) {
    const filePath = this.getVar<unknown>(variableName)
    if (typeof filePath !== 'string') throw new Error(`Stored variable ${variableName} must contain a file path string`)
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).setInputFiles(filePath)
  },
)
