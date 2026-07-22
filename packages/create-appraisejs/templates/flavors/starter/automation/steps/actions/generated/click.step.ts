import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name click
 * @description Generated human projections for canonical click operations
 * @type ACTION
 */

/**
 * @name double click
 * @description Template step for double clicking on an element
 * @icon MOUSE
 */
When('the user double clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.click.double.click@1', this, ['elementName'], [elementName])
})

/**
 * @name right click
 * @description Template step for right clicking on an element
 * @icon MOUSE
 */
When('the user right clicks on the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.click.right.click@1', this, ['elementName'], [elementName])
})

/**
 * @name Click element
 * @description Click a resolved locator target.
 * @icon MOUSE
 */
When('the user clicks on the {string} element', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.mouse.click@1', this, ['target'], [target])
})
