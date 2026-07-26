import {
  CustomWorld,
  SelectorName,
  Then,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name visibility assertion
 * @description Generated human projections for canonical visibility assertion operations
 * @type VALIDATION
 */

/**
 * @name Assert absent or hidden
 * @description Assert that a resolved target is absent from the DOM or not visible.
 * @icon VALIDATION
 */
Then('the {string} element should be hidden or absent', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.hidden@1', this, ['target'], [target])
})

/**
 * @name Assert persisted result
 * @description Assert that a persisted result is represented by the resolved target.
 * @icon VALIDATION
 */
Then('the persisted {string} element should be visible', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.persisted@1', this, ['target'], [target])
})

/**
 * @name assert element visible
 * @description Template step for validating whether an element should be visible or not
 * @icon VALIDATION
 */
Then(
  'the visibility status of the {string} element should be {boolean}',
  async function (this: CustomWorld, elementName: SelectorName, isVisible: boolean) {
    await executeHumanOperation(
      'browser.assertions.visibility@1',
      this,
      ['elementName', 'isVisible'],
      [elementName, isVisible],
    )
  },
)

/**
 * @name Assert visible
 * @description Assert that a resolved locator is visible.
 * @icon VALIDATION
 */
Then('the {string} element should be visible', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.assertions.visible@1', this, ['target'], [target])
})
