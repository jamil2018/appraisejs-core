import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const clickBuiltins = [
  {
    id: 'browser.mouse.click',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
      }
      try {
        await this.page.locator(selector).click()
      } catch (error) {
        throw new Error(`Failed to click on the ${elementName} element: ${error}`)
      }
    },
  },
  {
    id: 'browser.click.double.click',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
      }
      try {
        await this.page.locator(selector).dblclick()
      } catch (error) {
        throw new Error(`Failed to double click on the ${elementName} element: ${error}`)
      }
    },
  },
  {
    id: 'browser.click.right.click',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found. Current url: ${this.page.url()}`)
      }
      try {
        await this.page.locator(selector).click({ button: 'right' })
      } catch (error) {
        throw new Error(`Failed to right click on the ${elementName} element: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
