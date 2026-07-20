import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const storeBuiltins = [
  {
    id: 'browser.store.store.element.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }

      try {
        const value = await this.page.locator(selector).textContent()
        this.setVar(variableName, value ?? '')
      } catch (error) {
        throw new Error(`Failed to store the ${elementName} element text inside the variable ${variableName}: ${error}`)
      }
    },
  },
  {
    id: 'browser.store.store.text.input.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }

      try {
        const value = await this.page.locator(selector).inputValue()
        this.setVar(variableName, value)
      } catch (error) {
        throw new Error(
          `Failed to store the ${elementName} text input value inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.store.store.textarea.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }

      try {
        const value = await this.page.locator(selector).inputValue()
        this.setVar(variableName, value)
      } catch (error) {
        throw new Error(
          `Failed to store the ${elementName} textarea input value inside the variable ${variableName}: ${error}`,
        )
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
