import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name tabs frames dialogs
 * @description Generated human projections for canonical tabs frames dialogs operations
 * @type ACTION
 */

/**
 * @name accept next dialog
 * @description Accept the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user accepts the next browser dialog', async function (this: CustomWorld) {
  await executeHumanOperation('browser.tabs.frames.dialogs.accept.next.dialog@1', this, [], [])
})

/**
 * @name answer next prompt dialog
 * @description Accept the next browser prompt dialog with supplied text
 * @icon INPUT
 */
When('the user answers the next browser prompt with {string}', async function (this: CustomWorld, value: string) {
  await executeHumanOperation('browser.tabs.frames.dialogs.answer.next.prompt.dialog@1', this, ['value'], [value])
})

/**
 * @name click and switch to popup
 * @description Click an element, wait for a popup tab, and switch the active page to it
 * @icon NAVIGATION
 */
When(
  'the user clicks the {string} element and switches to the opened popup',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.click.and.switch.to.popup@1',
      this,
      ['elementName'],
      [elementName],
    )
  },
)

/**
 * @name click element inside frame
 * @description Click a locator inside an iframe resolved from the shared locator library
 * @icon MOUSE
 */
When(
  'the user clicks the {string} element inside the {string} frame',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.click.element.inside.frame@1',
      this,
      ['elementName', 'frameName'],
      [elementName, frameName],
    )
  },
)

/**
 * @name close current browser tab
 * @description Close the current tab and switch to the last remaining browser tab
 * @icon NAVIGATION
 */
When('the user closes the current browser tab', async function (this: CustomWorld) {
  await executeHumanOperation('browser.tabs.frames.dialogs.close.current.browser.tab@1', this, [], [])
})

/**
 * @name dismiss next dialog
 * @description Dismiss the next browser alert, confirm, or prompt dialog
 * @icon NAVIGATION
 */
When('the user dismisses the next browser dialog', async function (this: CustomWorld) {
  await executeHumanOperation('browser.tabs.frames.dialogs.dismiss.next.dialog@1', this, [], [])
})

/**
 * @name fill element inside frame
 * @description Fill a locator inside an iframe resolved from the shared locator library
 * @icon INPUT
 */
When(
  'the user fills the {string} element inside the {string} frame with {string}',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName, value: string) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.fill.element.inside.frame@1',
      this,
      ['elementName', 'frameName', 'value'],
      [elementName, frameName, value],
    )
  },
)

/**
 * @name switch browser tab
 * @description Switch to a browser tab or popup using its zero-based index
 * @icon NAVIGATION
 */
When('the user switches to browser tab {int}', async function (this: CustomWorld, index: number) {
  await executeHumanOperation('browser.tabs.frames.dialogs.switch.browser.tab@1', this, ['index'], [index])
})
