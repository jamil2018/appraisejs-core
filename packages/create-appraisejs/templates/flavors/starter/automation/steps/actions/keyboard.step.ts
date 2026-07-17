import {
  When,
  Then,
  CustomWorld,
  expect,
  SelectorName,
  resolveLocator,
  getEnvironment,
  generateRandomData,
  RandomDataType,
  runLocatorTemplateOperation,
  runPageTemplateOperation,
} from '../../../packages/cucumber-runtime/src/index.js'
/**
 * @name keyboard
 * @description Keyboard keys, shortcuts, sequential typing, and key state actions
 * @type ACTION
 */

/**
 * @name press key on element
 * @description Press one key or a Playwright key combination while an element is targeted
 * @icon INPUT
 */
When(
  'the user presses the {string} key on the {string} element',
  async function (this: CustomWorld, key: string, elementName: SelectorName) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).press(key)
  },
)

/**
 * @name press keyboard shortcut
 * @description Press a page-level keyboard shortcut such as Control+A or Meta+Shift+P
 * @icon INPUT
 */
When('the user presses the keyboard shortcut {string}', async function (this: CustomWorld, shortcut: string) {
  await this.page.keyboard.press(shortcut)
})

/**
 * @name type text sequentially
 * @description Type text into an element one key at a time with a delay in milliseconds
 * @icon INPUT
 */
When(
  'the user types {string} sequentially into the {string} element with delay {int} milliseconds',
  async function (this: CustomWorld, value: string, elementName: SelectorName, delay: number) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).pressSequentially(value, { delay })
  },
)

/**
 * @name hold keyboard key down
 * @description Hold a keyboard key down until a matching key-up step is used
 * @icon INPUT
 */
When('the user holds the {string} keyboard key down', async function (this: CustomWorld, key: string) {
  await this.page.keyboard.down(key)
})

/**
 * @name release keyboard key
 * @description Release a keyboard key that was held down
 * @icon INPUT
 */
When('the user releases the {string} keyboard key', async function (this: CustomWorld, key: string) {
  await this.page.keyboard.up(key)
})
