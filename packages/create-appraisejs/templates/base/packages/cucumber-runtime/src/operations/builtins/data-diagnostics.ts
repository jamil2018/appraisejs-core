import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const dataDiagnosticsBuiltins = [
  {
    id: 'browser.data.diagnostics.store.element.attribute',
    version: '1',
    parameters: [
      { name: 'attribute', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, attribute: string, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      this.setVar(variableName, (await this.page.locator(selector).getAttribute(attribute)) ?? '')
    },
  },
  {
    id: 'browser.data.diagnostics.store.current.url',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      this.setVar(variableName, this.page.url())
    },
  },
  {
    id: 'browser.data.diagnostics.store.page.title',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      this.setVar(variableName, await this.page.title())
    },
  },
  {
    id: 'browser.data.diagnostics.log.stored.variable',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const value = this.getVar(variableName)
      console.log(`[stored:${variableName}]`, JSON.stringify(value))
    },
  },
  {
    id: 'browser.data.diagnostics.capture.page.screenshot',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const screenshot = await this.page.screenshot({ fullPage: true })
      this.setVar(variableName, screenshot.toString('base64'))
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
