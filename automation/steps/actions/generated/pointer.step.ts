import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name pointer
 * @description Generated human projections for canonical pointer operations
 * @type ACTION
 */

/**
 * @name Focus element
 * @description Move keyboard focus to a resolved locator.
 * @icon MOUSE
 */
When('the user focuses the {string} element', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.keyboard.focus@1', this, ['target'], [target])
})

/**
 * @name blur element
 * @description Remove keyboard focus from an element
 * @icon MOUSE
 */
When('the user blurs the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.blur.element@1', this, ['elementName'], [elementName])
})

/**
 * @name capture element screenshot
 * @description Capture an element screenshot and store its base64 bytes in a variable
 * @icon DEBUG
 */
When(
  'the user captures a screenshot of the {string} element in the variable {string}',
  async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
    await executeHumanOperation(
      'browser.pointer.capture.element.screenshot@1',
      this,
      ['elementName', 'variableName'],
      [elementName, variableName],
    )
  },
)

/**
 * @name click element coordinates
 * @description Click an x and y coordinate relative to a locator element
 * @icon MOUSE
 */
When(
  'the user clicks coordinates x {int} and y {int} inside the {string} element',
  async function (this: CustomWorld, x: number, y: number, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.pointer.click.element.coordinates@1',
      this,
      ['x', 'y', 'elementName'],
      [x, y, elementName],
    )
  },
)

/**
 * @name click page coordinates
 * @description Click an exact x and y page coordinate with the mouse pointer
 * @icon MOUSE
 */
When('the user clicks page coordinates x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await executeHumanOperation('browser.pointer.click.page.coordinates@1', this, ['x', 'y'], [x, y])
})

/**
 * @name drag element to element
 * @description Drag a source locator and drop it onto a target locator
 * @icon MOUSE
 */
When(
  'the user drags the {string} element onto the {string} element',
  async function (this: CustomWorld, sourceName: SelectorName, targetName: SelectorName) {
    await executeHumanOperation(
      'browser.pointer.drag.element.to.element@1',
      this,
      ['sourceName', 'targetName'],
      [sourceName, targetName],
    )
  },
)

/**
 * @name force click element
 * @description Force click an element when actionability checks must be bypassed deliberately
 * @icon MOUSE
 */
When('the user force clicks the {string} element', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.force.click.element@1', this, ['elementName'], [elementName])
})

/**
 * @name scroll element into view
 * @description Scroll until the target element is inside the viewport
 * @icon MOUSE
 */
When('the user scrolls the {string} element into view', async function (this: CustomWorld, elementName: SelectorName) {
  await executeHumanOperation('browser.pointer.scroll.element.into.view@1', this, ['elementName'], [elementName])
})

/**
 * @name scroll page by offset
 * @description Scroll the page horizontally and vertically by pixel offsets
 * @icon MOUSE
 */
When('the user scrolls the page by x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await executeHumanOperation('browser.pointer.scroll.page.by.offset@1', this, ['x', 'y'], [x, y])
})
