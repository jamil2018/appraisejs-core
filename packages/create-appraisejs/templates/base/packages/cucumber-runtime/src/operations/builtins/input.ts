import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const inputBuiltins = [
  {
    id: 'browser.input.check',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      try {
        await this.page.locator(selector).check()
      } catch (error) {
        throw new Error(`Failed to check the ${elementName} checkbox: ${error}`)
      }
    },
  },
  {
    id: 'browser.input.clear',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      try {
        await this.page.locator(selector).clear()
      } catch (error) {
        throw new Error(`Failed to clear the ${elementName} field: ${error}`)
      }
    },
  },
  {
    id: 'browser.forms.fill',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, value: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      try {
        await this.page.locator(selector).fill(value)
      } catch (error) {
        throw new Error(`Failed to fill in the ${elementName} input field: ${error}`)
      }
    },
  },
  {
    id: 'browser.input.fill.input.with.stored.value',
    version: '1',
    parameters: [
      { name: 'fieldName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, fieldName: SelectorName, variableName: string) {
      const value = this.getVar<string>(variableName)
      const selector = await resolveLocator(this.page, fieldName)
      if (!selector) {
        throw new Error(`Selector ${fieldName} not found`)
      }
      try {
        await this.page.locator(selector).fill(value)
      } catch (error) {
        throw new Error(
          `Failed to fill in the ${fieldName} input field with data from the stored variable ${variableName}: ${error}`,
        )
      }
    },
  },
  {
    id: 'browser.input.select.dropdown.option',
    version: '1',
    parameters: [
      { name: 'optionName', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, optionName: string, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      try {
        await this.page.locator(selector).selectOption(optionName)
      } catch (error) {
        throw new Error(`Failed to select the ${optionName} option of the ${elementName} dropdown: ${error}`)
      }
    },
  },
  {
    id: 'browser.input.uncheck',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) {
        throw new Error(`Selector ${elementName} not found`)
      }
      try {
        await this.page.locator(selector).uncheck()
      } catch (error) {
        throw new Error(`Failed to uncheck the ${elementName} checkbox: ${error}`)
      }
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
