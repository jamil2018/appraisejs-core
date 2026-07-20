import { expect } from '../../assertion.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const downloadAssertionBuiltins = [
  {
    id: 'browser.download.assertion.assert.downloaded.filename',
    version: '1',
    parameters: [
      { name: 'variableName', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, variableName: string, expected: string) {
      expect(this.getVar<unknown>(variableName)).to.equal(expected)
    },
  },
  {
    id: 'browser.download.assertion.assert.download.path.available',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      const value = this.getVar<unknown>(variableName)
      expect(typeof value === 'string' && value.length > 0).to.equal(true)
    },
  },
  {
    id: 'browser.download.assertion.assert.stored.download.filename',
    version: '1',
    parameters: [
      { name: 'variableName', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, variableName: string, expected: string) {
      const download = this.getVar<{ suggestedFilename(): string }>(variableName)
      if (!download || typeof download.suggestedFilename !== 'function') {
        throw new Error(`Stored variable ${variableName} does not contain a Playwright download`)
      }
      expect(download.suggestedFilename()).to.equal(expected)
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
