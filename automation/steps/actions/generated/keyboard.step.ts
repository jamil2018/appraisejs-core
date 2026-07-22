import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'
/**
 * @name keyboard
 * @description Generated human projections for canonical keyboard operations
 * @type ACTION
 */

/**
 * @name hold keyboard key down
 * @description Hold a keyboard key down until a matching key-up step is used
 * @icon INPUT
 */
When('the user holds the {string} keyboard key down', async function (this: CustomWorld, key: string) {
  await executeHumanOperation('browser.keyboard.hold.keyboard.key.down@1', this, ['key'], [key])
})

/**
 * @name Press keyboard key
 * @description Press a portable Playwright keyboard key or chord.
 * @icon INPUT
 */
When('the user presses the keyboard shortcut {string}', async function (this: CustomWorld, key: string) {
  await executeHumanOperation('browser.keyboard.press@1', this, ['key'], [key])
})

/**
 * @name press key on element
 * @description Press one key or a Playwright key combination while an element is targeted
 * @icon INPUT
 */
When(
  'the user presses the {string} key on the {string} element',
  async function (this: CustomWorld, key: string, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.keyboard.press.key.on.element@1',
      this,
      ['key', 'elementName'],
      [key, elementName],
    )
  },
)

/**
 * @name release keyboard key
 * @description Release a keyboard key that was held down
 * @icon INPUT
 */
When('the user releases the {string} keyboard key', async function (this: CustomWorld, key: string) {
  await executeHumanOperation('browser.keyboard.release.keyboard.key@1', this, ['key'], [key])
})

/**
 * @name type text sequentially
 * @description Type text into an element one key at a time with a delay in milliseconds
 * @icon INPUT
 */
When(
  'the user types {string} sequentially into the {string} element with delay {int} milliseconds',
  async function (this: CustomWorld, value: string, elementName: SelectorName, delay: number) {
    await executeHumanOperation(
      'browser.keyboard.type.text.sequentially@1',
      this,
      ['value', 'elementName', 'delay'],
      [value, elementName, delay],
    )
  },
)
