import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name synchronization
 * @description Generated human projections for canonical synchronization operations
 * @type ACTION
 */

/**
 * @name wait for dialog
 * @description Wait for the next browser dialog and store its message in a runtime variable
 * @icon WAIT
 */
When(
  'the user waits for a dialog and stores its message in {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation('browser.synchronization.wait.for.dialog@1', this, ['variableName'], [variableName])
  },
)

/**
 * @name wait for element state
 * @description Wait for an element to become attached, detached, visible, or hidden
 * @icon WAIT
 */
When(
  'the user waits for the {string} element state to be {string}',
  async function (this: CustomWorld, elementName: SelectorName, state: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.element.state@1',
      this,
      ['elementName', 'state'],
      [elementName, state],
    )
  },
)

/**
 * @name wait for element text
 * @description Wait until an element contains expected text
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to contain text {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedText: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.element.text@1',
      this,
      ['elementName', 'expectedText'],
      [elementName, expectedText],
    )
  },
)

/**
 * @name wait for input value
 * @description Wait until an input element equals an expected value
 * @icon WAIT
 */
When(
  'the user waits for the {string} input value to equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedValue: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.input.value@1',
      this,
      ['elementName', 'expectedValue'],
      [elementName, expectedValue],
    )
  },
)

/**
 * @name wait for load state
 * @description Wait for load, domcontentloaded, or networkidle page state
 * @icon WAIT
 */
When('the user waits for page load state {string}', async function (this: CustomWorld, state: string) {
  await executeHumanOperation('browser.synchronization.wait.for.load.state@1', this, ['state'], [state])
})

/**
 * @name wait for popup
 * @description Wait for a popup event and store the opened page in a runtime variable
 * @icon WAIT
 */
When('the user waits for a popup and stores it in {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.synchronization.wait.for.popup@1', this, ['variableName'], [variableName])
})

/**
 * @name wait for request
 * @description Wait for an outgoing HTTP request whose URL contains expected text
 * @icon WAIT
 */
When('the user waits for a request url containing {string}', async function (this: CustomWorld, urlPart: string) {
  await executeHumanOperation('browser.synchronization.wait.for.request@1', this, ['urlPart'], [urlPart])
})

/**
 * @name wait for response
 * @description Wait for an HTTP response whose URL contains text and status equals the expected code
 * @icon WAIT
 */
When(
  'the user waits for a response url containing {string} with status {int}',
  async function (this: CustomWorld, urlPart: string, status: number) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.response@1',
      this,
      ['urlPart', 'status'],
      [urlPart, status],
    )
  },
)

/**
 * @name wait for url
 * @description Wait until the current URL contains expected text
 * @icon WAIT
 */
When('the user waits for the url to contain {string}', async function (this: CustomWorld, expected: string) {
  await executeHumanOperation('browser.synchronization.wait.for.url@1', this, ['expected'], [expected])
})
