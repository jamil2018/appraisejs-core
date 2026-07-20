import { expect } from '../../assertion.ts'
import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const activeStateAssertionBuiltins = [
  {
    id: 'browser.active.state.assertion.assert.element.active',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'isActive', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, isActive: boolean) {
      try {
        const selector = await resolveLocator(this.page, elementName)
        if (!selector) throw new Error(`Selector ${elementName} not found`)
        const elementActiveStatus = await this.page.locator(selector).isEnabled({ timeout: 10000 })
        if (isActive) {
          void expect(elementActiveStatus, `Expected ${elementName} to be active`).to.be.true
        } else {
          void expect(elementActiveStatus, `Expected ${elementName} NOT to be active`).to.be.false
        }
      } catch (error) {
        throw new Error(`Failed to validate the active status of the element ${elementName}: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
