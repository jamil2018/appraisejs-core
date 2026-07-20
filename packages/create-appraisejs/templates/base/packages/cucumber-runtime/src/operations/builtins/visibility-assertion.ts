import { expect } from '../../assertion.ts'
import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const visibilityAssertionBuiltins = [
  {
    id: 'browser.assertions.visibility',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'isVisible', type: 'BOOLEAN' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, isVisible: boolean) {
      try {
        const selector = await resolveLocator(this.page, elementName, {
          validate: isVisible ? undefined : false,
        })
        if (!selector) throw new Error(`Selector ${elementName} not found`)
        const elementVisibilityStatus = await this.page.locator(selector).isVisible({ timeout: 10000 })
        expect(elementVisibilityStatus).to.equal(isVisible)
      } catch (error) {
        throw new Error(`Failed to validate the visibility of the element ${elementName}: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
