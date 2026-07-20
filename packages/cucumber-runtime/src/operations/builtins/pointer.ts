import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const pointerBuiltins = [
  {
    id: 'browser.pointer.click.page.coordinates',
    version: '1',
    parameters: [
      { name: 'x', type: 'NUMBER' },
      { name: 'y', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, x: number, y: number) {
      await this.page.mouse.click(x, y)
    },
  },
  {
    id: 'browser.pointer.click.element.coordinates',
    version: '1',
    parameters: [
      { name: 'x', type: 'NUMBER' },
      { name: 'y', type: 'NUMBER' },
      { name: 'elementName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, x: number, y: number, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).click({ position: { x, y } })
    },
  },
  {
    id: 'browser.pointer.force.click.element',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).click({ force: true })
    },
  },
  {
    id: 'browser.pointer.drag.element.to.element',
    version: '1',
    parameters: [
      { name: 'sourceName', type: 'LOCATOR' },
      { name: 'targetName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, sourceName: SelectorName, targetName: SelectorName) {
      const sourceSelector = await resolveLocator(this.page, sourceName)
      const targetSelector = await resolveLocator(this.page, targetName)
      if (!sourceSelector) throw new Error(`Selector ${sourceName} not found`)
      if (!targetSelector) throw new Error(`Selector ${targetName} not found`)
      await this.page.locator(sourceSelector).dragTo(this.page.locator(targetSelector))
    },
  },
  {
    id: 'browser.keyboard.focus',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).focus()
    },
  },
  {
    id: 'browser.pointer.blur.element',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).blur()
    },
  },
  {
    id: 'browser.pointer.scroll.element.into.view',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).scrollIntoViewIfNeeded()
    },
  },
  {
    id: 'browser.pointer.scroll.page.by.offset',
    version: '1',
    parameters: [
      { name: 'x', type: 'NUMBER' },
      { name: 'y', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, x: number, y: number) {
      await this.page.mouse.wheel(x, y)
    },
  },
  {
    id: 'browser.pointer.capture.element.screenshot',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const screenshot = await this.page.locator(selector).screenshot()
      this.setVar(variableName, screenshot.toString('base64'))
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
