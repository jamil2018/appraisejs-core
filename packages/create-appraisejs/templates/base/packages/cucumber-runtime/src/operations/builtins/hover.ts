import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const hoverBuiltins = [
  {
    id: 'browser.hover.hover',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      try {
        const selector = await resolveLocator(this.page, elementName)
        if (!selector) {
          throw new Error(`Selector ${elementName} not found`)
        }
        await this.page.locator(selector).hover()
      } catch (error) {
        throw new Error(`Failed to hover over the ${elementName} element: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
