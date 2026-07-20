import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const keyboardBuiltins = [
  {
    id: 'browser.keyboard.press.key.on.element',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, key: string, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).press(key)
    },
  },
  {
    id: 'browser.keyboard.press',
    version: '1',
    parameters: [{ name: 'shortcut', type: 'STRING' }],
    execute: async function (this: CustomWorld, shortcut: string) {
      await this.page.keyboard.press(shortcut)
    },
  },
  {
    id: 'browser.keyboard.type.text.sequentially',
    version: '1',
    parameters: [
      { name: 'value', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'delay', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, value: string, elementName: SelectorName, delay: number) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).pressSequentially(value, { delay })
    },
  },
  {
    id: 'browser.keyboard.hold.keyboard.key.down',
    version: '1',
    parameters: [{ name: 'key', type: 'STRING' }],
    execute: async function (this: CustomWorld, key: string) {
      await this.page.keyboard.down(key)
    },
  },
  {
    id: 'browser.keyboard.release.keyboard.key',
    version: '1',
    parameters: [{ name: 'key', type: 'STRING' }],
    execute: async function (this: CustomWorld, key: string) {
      await this.page.keyboard.up(key)
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
