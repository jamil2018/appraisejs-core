import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name forms
 * @description Generated human projections for canonical forms operations
 * @type ACTION
 */

/**
 * @name choose radio control
 * @description Check a radio button or radio control element
 * @icon INPUT
 */
When('the user chooses the {string} radio control', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.forms.choose.radio.control@1', this, ['elementName'], [elementName])
})

/**
 * @name fill content editable element
 * @description Fill a contenteditable rich-text element with text
 * @icon INPUT
 */
When(
  'the user fills the content editable {string} element with {string}',
  async function (this: CustomWorld, elementName: SelectorName, value: string) {
    await executeHumanOperation(
      'browser.forms.fill.content.editable.element@1',
      this,
      ['elementName', 'value'],
      [elementName, value],
    )
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
    await executeHumanOperation('browser.forms.fill.date.input@1', this, ['elementName', 'value'], [elementName, value])
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
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.index@1',
      this,
      ['index', 'elementName'],
      [index, elementName],
    )
  },
)

/**
 * @name select dropdown option by label
 * @description Select a dropdown option using its visible label text
 * @icon INPUT
 */
When(
  'the user selects label {string} from the {string} dropdown',
  async function (this: CustomWorld, label: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.label@1',
      this,
      ['label', 'elementName'],
      [label, elementName],
    )
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
    await executeHumanOperation(
      'browser.forms.select.dropdown.option.by.value@1',
      this,
      ['value', 'elementName'],
      [value, elementName],
    )
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
    await executeHumanOperation(
      'browser.forms.upload.file@1',
      this,
      ['filePath', 'elementName'],
      [filePath, elementName],
    )
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
    await executeHumanOperation(
      'browser.forms.upload.stored.file@1',
      this,
      ['variableName', 'elementName'],
      [variableName, elementName],
    )
  },
)
