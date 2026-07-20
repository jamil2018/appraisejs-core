import { expect } from '../../assertion.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const browserAssertionBuiltins = [
  {
    id: 'browser.browser.assertion.assert.full.url',
    version: '1',
    parameters: [{ name: 'expected', type: 'STRING' }],
    execute: async function (this: CustomWorld, expected: string) {
      expect(this.page.url()).to.equal(expected)
    },
  },
  {
    id: 'browser.browser.assertion.assert.url.contains',
    version: '1',
    parameters: [{ name: 'expected', type: 'STRING' }],
    execute: async function (this: CustomWorld, expected: string) {
      expect(this.page.url()).to.contain(expected)
    },
  },
  {
    id: 'browser.browser.assertion.assert.page.title',
    version: '1',
    parameters: [{ name: 'expected', type: 'STRING' }],
    execute: async function (this: CustomWorld, expected: string) {
      expect(await this.page.title()).to.equal(expected)
    },
  },
  {
    id: 'browser.browser.assertion.assert.browser.cookie',
    version: '1',
    parameters: [
      { name: 'name', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, name: string, expected: string) {
      const cookies = await this.context.cookies(this.page.url())
      expect(cookies.find(cookie => cookie.name === name)?.value ?? '').to.equal(expected)
    },
  },
  {
    id: 'browser.browser.assertion.assert.local.storage.value',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, key: string, expected: string) {
      const actual = await this.page.evaluate(storageKey => localStorage.getItem(storageKey), key)
      expect(actual ?? '').to.equal(expected)
    },
  },
  {
    id: 'browser.browser.assertion.assert.session.storage.value',
    version: '1',
    parameters: [
      { name: 'key', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, key: string, expected: string) {
      const actual = await this.page.evaluate(storageKey => sessionStorage.getItem(storageKey), key)
      expect(actual ?? '').to.equal(expected)
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
