import { expect } from '../../assertion.ts'
import { waitForRouteSettled } from '../../locator.util.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const navigationAssertionBuiltins = [
  {
    id: 'browser.navigation.assertion.assert.url.route.equals',
    version: '1',
    parameters: [{ name: 'route', type: 'STRING' }],
    execute: async function (this: CustomWorld, route: string) {
      try {
        await this.page.waitForURL(url => url.pathname === route.toLowerCase())
        await waitForRouteSettled(this.page)
        const currentRoute = new URL(this.page.url()).pathname
        expect(currentRoute, `Expected the current route to be "${route}"`).to.equal(route.toLowerCase())
      } catch (error) {
        throw new Error(`Failed to validate the equality of the current route to the route "${route}": ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
