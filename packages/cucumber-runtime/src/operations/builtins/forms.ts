import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const formsBuiltins = [
  {
    id: 'browser.forms.choose.radio.control',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).check()
    },
  },
  {
    id: 'browser.forms.select.dropdown.option.by.label',
    version: '1',
    parameters: [
      { name: 'label', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, label: string, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).selectOption({ label })
    },
  },
  {
    id: 'browser.forms.select.dropdown.option.by.value',
    version: '1',
    parameters: [
      { name: 'value', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, value: string, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).selectOption({ value })
    },
  },
  {
    id: 'browser.forms.select.dropdown.option.by.index',
    version: '1',
    parameters: [
      { name: 'index', type: 'NUMBER' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, index: number, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).selectOption({ index })
    },
  },
  {
    id: 'browser.forms.fill.date.input',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, value: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).fill(value)
    },
  },
  {
    id: 'browser.forms.fill.content.editable.element',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, value: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).fill(value)
    },
  },
  {
    id: 'browser.forms.upload.file',
    version: '1',
    parameters: [
      { name: 'filePath', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, filePath: string, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).setInputFiles(filePath)
    },
  },
  {
    id: 'browser.forms.upload.stored.file',
    version: '1',
    parameters: [
      { name: 'variableName', type: 'STRING' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, variableName: string, elementName: SelectorName) {
      const filePath = this.getVar<unknown>(variableName)
      if (typeof filePath !== 'string')
        throw new Error(`Stored variable ${variableName} must contain a file path string`)
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).setInputFiles(filePath)
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
