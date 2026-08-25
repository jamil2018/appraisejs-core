import { getEnvironment } from '../../environment.util.ts'
import { waitForRouteSettled } from '../../locator.util.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'
import { gotoSealedOrigin } from '../sealed-origin.ts'
import { SealedOriginError } from '../sealed-origin.ts'

export const navigationBuiltins = [
  {
    id: 'browser.navigation.goto',
    version: '1',
    parameters: [{ name: 'url', type: 'STRING' }],
    execute: async function (this: CustomWorld, url: string) {
      try {
        await gotoSealedOrigin(this.page, url, this.sealedBaseUrl, { waitUntil: 'domcontentloaded' })
        // Bound readiness by route and DOM stability. Long-lived analytics,
        // polling, or streaming requests must not block managed navigation.
        await waitForRouteSettled(this.page)
      } catch (error) {
        if (error instanceof SealedOriginError) throw error
        throw new Error(`Failed to navigate to the ${url} url: ${error}`)
      }
    },
  },
  {
    id: 'browser.navigation.reload',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      try {
        await this.page.reload()
        await this.page.waitForLoadState('domcontentloaded')
      } catch (error) {
        throw new Error(`Failed to reload the page: ${error}`)
      }
    },
  },
  {
    id: 'browser.navigation.go.back',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      try {
        await this.page.goBack({ waitUntil: 'domcontentloaded' })
      } catch (error) {
        throw new Error(`Failed to go back to the previous page: ${error}`)
      }
    },
  },
  {
    id: 'browser.navigation.navigate.to.environment.base.url',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      try {
        // Managed capsules carry the immutable environment packet as their
        // sealed base URL and deliberately do not inherit the mutable
        // ENVIRONMENT name. Preserve the legacy lookup only for ordinary CLI
        // execution, where no managed origin has been sealed on the World.
        const baseUrl = this.sealedBaseUrl ?? legacyEnvironmentBaseUrl()
        await gotoSealedOrigin(this.page, baseUrl, this.sealedBaseUrl, {
          waitUntil: 'domcontentloaded',
        })
      } catch (error) {
        if (error instanceof SealedOriginError) throw error
        throw new Error(`Failed to navigate to the base url of the selected environment: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]

function legacyEnvironmentBaseUrl() {
  const environment = process.env.ENVIRONMENT as string
  if (!environment) throw new Error('Environment is not set')
  const environmentConfig = getEnvironment(environment)
  if (!environmentConfig) throw new Error(`Environment ${environment} not found`)
  return environmentConfig.baseUrl
}
