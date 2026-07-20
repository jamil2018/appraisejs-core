import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const waitBuiltins = [
  {
    id: 'browser.wait.wait.for.element',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName, {
        validate: { requireVisible: false },
      })
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }

      try {
        await this.page.locator(selector).waitFor({ state: 'visible' })
      } catch (error) {
        throw new Error(`Failed to wait for the element ${elementName} to become visible: ${error}`)
      }
    },
  },
  {
    id: 'browser.wait.wait.for.element.to.disappear',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName, {
        validate: { requireVisible: false },
      })
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }

      try {
        await this.page.locator(selector).waitFor({ state: 'hidden' })
      } catch (error) {
        throw new Error(`Failed to wait for the ${elementName} element to disappear: ${error}`)
      }
    },
  },
  {
    id: 'browser.waits.page-ready',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      try {
        await this.page.waitForLoadState('domcontentloaded')
      } catch (error) {
        throw new Error(`Failed to wait for the current page to be loaded: ${error}`)
      }
    },
  },
  {
    id: 'browser.waits.duration',
    version: '1',
    parameters: [{ name: 'seconds', type: 'NUMBER' }],
    execute: async function (this: CustomWorld, seconds: number) {
      try {
        await this.page.waitForTimeout(seconds * 1000)
      } catch (error) {
        throw new Error(`Failed to wait for ${seconds} seconds: ${error}`)
      }
    },
  },
  {
    id: 'browser.wait.wait.for.url.route',
    version: '1',
    parameters: [{ name: 'route', type: 'STRING' }],
    execute: async function (this: CustomWorld, route: string) {
      try {
        await this.page.waitForURL(url => url.pathname === route || url.pathname.endsWith(route))
      } catch (error) {
        throw new Error(`Failed to wait for the route ${route} to be loaded: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
