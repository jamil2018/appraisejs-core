import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name data diagnostics
 * @description Generated human projections for canonical data diagnostics operations
 * @type ACTION
 */

/**
 * @name capture page screenshot
 * @description Capture a full-page screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a full page screenshot in variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.data.diagnostics.capture.page.screenshot@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)

/**
 * @name log stored variable
 * @description Log a stored runtime variable as JSON for test diagnostics
 * @icon DEBUG
 */
When('the user logs the stored variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.data.diagnostics.log.stored.variable@1', this, ['variableName'], [variableName])
})

/**
 * @name store current url
 * @description Store the current browser page URL in a runtime variable
 * @icon STORE
 */
When('the user stores the current url in variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.data.diagnostics.store.current.url@1', this, ['variableName'], [variableName])
})

/**
 * @name store element attribute
 * @description Store an element attribute value in a runtime variable
 * @icon STORE
 */
When(
  'the user stores attribute {string} from the {string} element in variable {string}',
  async function (this: CustomWorld, attribute: string, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.data.diagnostics.store.element.attribute@1',
      this,
      ['attribute', 'elementName', 'variableName'],
      [attribute, elementName, variableName],
    )
  },
)

/**
 * @name store page title
 * @description Store the current browser page title in a runtime variable
 * @icon STORE
 */
When('the user stores the page title in variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.data.diagnostics.store.page.title@1', this, ['variableName'], [variableName])
})
