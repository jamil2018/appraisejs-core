import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const tabsFramesDialogsBuiltins = [
  {
    id: 'browser.tabs.frames.dialogs.switch.browser.tab',
    version: '1',
    parameters: [{ name: 'index', type: 'NUMBER' }],
    execute: async function (this: CustomWorld, index: number) {
      const pages = this.context.pages()
      const target = pages[index]
      if (!target) throw new Error(`Browser tab index ${index} does not exist; ${pages.length} tab(s) are open`)
      this.page = target
      await target.bringToFront()
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.close.current.browser.tab',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      await this.page.close()
      const pages = this.context.pages()
      const target = pages.at(-1)
      if (!target) throw new Error('No browser tabs remain after closing the current tab')
      this.page = target
      await target.bringToFront()
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.click.and.switch.to.popup',
    version: '1',
    parameters: [{ name: 'elementName', type: 'LOCATOR' }],
    execute: async function (this: CustomWorld, elementName: SelectorName) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const [popup] = await Promise.all([this.page.waitForEvent('popup'), this.page.locator(selector).click()])
      await popup.waitForLoadState('domcontentloaded')
      this.page = popup
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.click.element.inside.frame',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'frameName', type: 'LOCATOR' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName) {
      const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
      const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
      if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
      await this.page.frameLocator(frameSelector).locator(elementSelector).click()
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.fill.element.inside.frame',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'frameName', type: 'LOCATOR' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName, value: string) {
      const frameSelector = await resolveLocator(this.page, frameName, { validate: { requireVisible: false } })
      const elementSelector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!frameSelector) throw new Error(`Selector ${frameName} not found`)
      if (!elementSelector) throw new Error(`Selector ${elementName} not found`)
      await this.page.frameLocator(frameSelector).locator(elementSelector).fill(value)
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.accept.next.dialog',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      this.page.once('dialog', dialog => dialog.accept())
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.dismiss.next.dialog',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      this.page.once('dialog', dialog => dialog.dismiss())
    },
  },
  {
    id: 'browser.tabs.frames.dialogs.answer.next.prompt.dialog',
    version: '1',
    parameters: [{ name: 'value', type: 'STRING' }],
    execute: async function (this: CustomWorld, value: string) {
      this.page.once('dialog', dialog => dialog.accept(value))
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
