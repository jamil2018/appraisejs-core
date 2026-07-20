import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const synchronizationBuiltins = [
  {
    id: 'browser.synchronization.wait.for.url',
    version: '1',
    parameters: [{ name: 'expected', type: 'STRING' }],
    execute: async function (this: CustomWorld, expected: string) {
      await this.page.waitForURL(url => url.toString().includes(expected))
    },
  },
  {
    id: 'browser.synchronization.wait.for.load.state',
    version: '1',
    parameters: [{ name: 'state', type: 'STRING' }],
    execute: async function (this: CustomWorld, state: string) {
      if (!['load', 'domcontentloaded', 'networkidle'].includes(state)) {
        throw new Error(`Unsupported page load state: ${state}`)
      }
      await this.page.waitForLoadState(state as 'load' | 'domcontentloaded' | 'networkidle')
    },
  },
  {
    id: 'browser.synchronization.wait.for.element.state',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'state', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, state: string) {
      if (!['attached', 'detached', 'visible', 'hidden'].includes(state)) {
        throw new Error(`Unsupported element wait state: ${state}`)
      }
      const selector = await resolveLocator(this.page, elementName, { validate: false })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).waitFor({ state: state as 'attached' | 'detached' | 'visible' | 'hidden' })
    },
  },
  {
    id: 'browser.synchronization.wait.for.element.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expectedText', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expectedText: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).filter({ hasText: expectedText }).waitFor({ state: 'visible' })
    },
  },
  {
    id: 'browser.synchronization.wait.for.input.value',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expectedValue', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expectedValue: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      await this.page.locator(selector).evaluate(
        (element, value) =>
          new Promise<void>((resolve, reject) => {
            const deadline = Date.now() + 10_000
            const timer = setInterval(() => {
              if ((element as HTMLInputElement).value === value) {
                clearInterval(timer)
                resolve()
              } else if (Date.now() >= deadline) {
                clearInterval(timer)
                reject(new Error(`Input value did not become ${value}`))
              }
            }, 50)
          }),
        expectedValue,
      )
    },
  },
  {
    id: 'browser.synchronization.wait.for.request',
    version: '1',
    parameters: [{ name: 'urlPart', type: 'STRING' }],
    execute: async function (this: CustomWorld, urlPart: string) {
      await this.page.waitForRequest(request => request.url().includes(urlPart))
    },
  },
  {
    id: 'browser.synchronization.wait.for.response',
    version: '1',
    parameters: [
      { name: 'urlPart', type: 'STRING' },
      { name: 'status', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, urlPart: string, status: number) {
      await this.page.waitForResponse(response => response.url().includes(urlPart) && response.status() === status)
    },
  },
  {
    id: 'browser.synchronization.wait.for.popup',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      this.setVar(variableName, await this.page.waitForEvent('popup'))
    },
  },
  {
    id: 'browser.synchronization.wait.for.dialog',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const dialog = await this.page.waitForEvent('dialog')
      this.setVar(variableName, dialog.message())
      await dialog.dismiss()
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
