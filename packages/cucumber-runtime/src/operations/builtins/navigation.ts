import { getEnvironment } from '../../environment.util.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const navigationBuiltins = [
  {
    id: 'browser.navigation.goto',
    version: '1',
    parameters: [{ name: 'url', type: 'STRING' }],
    execute: async function (this: CustomWorld, url: string) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' })
      } catch (error) {
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
        const environment = process.env.ENVIRONMENT as string
        if (!environment) {
          throw new Error('Environment is not set')
        }
        const environmentConfig = getEnvironment(environment)
        if (!environmentConfig) {
          throw new Error(`Environment ${environment} not found`)
        }
        await this.page.goto(environmentConfig.baseUrl, {
          waitUntil: 'domcontentloaded',
        })
      } catch (error) {
        throw new Error(`Failed to navigate to the base url of the selected environment: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
