import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'
import { gotoSealedOrigin } from '../sealed-origin.ts'

export const browserStateBuiltins = [
  {
    id: 'browser.browser.state.go.forward',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      await this.page.goForward({ waitUntil: 'domcontentloaded' })
    },
  },
  {
    id: 'browser.browser.state.navigate.to.stored.url',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const url = this.getVar<unknown>(variableName)
      if (typeof url !== 'string') throw new Error(`Stored variable ${variableName} must contain a URL string`)
      await gotoSealedOrigin(this.page, url, this.sealedBaseUrl, { waitUntil: 'domcontentloaded' })
    },
  },
  {
    id: 'browser.viewport.set',
    version: '1',
    parameters: [
      { name: 'width', type: 'NUMBER' },
      { name: 'height', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Viewport width and height must be positive integers')
      await this.page.setViewportSize({ width, height })
    },
  },
  {
    id: 'browser.browser.state.set.browser.cookie',
    version: '1',
    parameters: [
      { name: 'name', type: 'STRING' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, name: string, value: string) {
      await this.context.addCookies([{ name, value, url: this.page.url() }])
    },
  },
  {
    id: 'browser.browser.state.clear.browser.cookies',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      await this.context.clearCookies()
    },
  },
  {
    id: 'browser.browser.state.set.local.storage.value',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, key: string, value: string) {
      await this.page.evaluate(
        ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
        [key, value],
      )
    },
  },
  {
    id: 'browser.browser.state.set.session.storage.value',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'value', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, key: string, value: string) {
      await this.page.evaluate(
        ([storageKey, storageValue]) => sessionStorage.setItem(storageKey, storageValue),
        [key, value],
      )
    },
  },
  {
    id: 'browser.browser.state.set.storage.from.variable',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, key: string, variableName: string) {
      const value = this.getVar<unknown>(variableName)
      if (typeof value !== 'string') throw new Error(`Stored variable ${variableName} must contain a string`)
      await this.page.evaluate(
        ([storageKey, storageValue]) => localStorage.setItem(storageKey, storageValue),
        [key, value],
      )
    },
  },
  {
    id: 'browser.browser.state.clear.web.storage',
    version: '1',
    parameters: [],
    execute: async function (this: CustomWorld) {
      await this.page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
