import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name hover
 * @description Generated human projections for canonical hover operations
 * @type ACTION
 */

/**
 * @name hover
 * @description Template step for hovering over an element
 * @icon MOUSE
 */
When(
  'the user hovers the cursor over the {string} element',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation('browser.hover.hover@1', this, ['elementName'], [elementName])
  },
)
