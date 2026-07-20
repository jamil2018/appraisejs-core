import { expect } from '../../assertion.ts'
import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const elementStateAssertionBuiltins = [
  {
    id: 'browser.element.state.assertion.assert.element.attached',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: false })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect((await this.page.locator(selector).count()) > 0).to.equal(expected)
    },
  },
  {
    id: 'browser.element.state.assertion.assert.element.enabled',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect(await this.page.locator(selector).isEnabled()).to.equal(expected)
    },
  },
  {
    id: 'browser.element.state.assertion.assert.element.editable',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect(await this.page.locator(selector).isEditable()).to.equal(expected)
    },
  },
  {
    id: 'browser.assertions.checked',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect(await this.page.locator(selector).isChecked()).to.equal(expected)
    },
  },
  {
    id: 'browser.element.state.assertion.assert.element.focused',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const focused = await this.page.locator(selector).evaluate(element => element === document.activeElement)
      expect(focused).to.equal(expected)
    },
  },
  {
    id: 'browser.element.state.assertion.assert.element.empty',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: boolean) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const value = await this.page.locator(selector).evaluate(element => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          return element.value
        }
        return element.textContent ?? ''
      })
      expect(value.length === 0).to.equal(expected)
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
