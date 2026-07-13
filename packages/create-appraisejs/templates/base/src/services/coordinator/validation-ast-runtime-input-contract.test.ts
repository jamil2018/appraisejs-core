import { describe, expect, it } from 'vitest'

import { uniqueProjectedActionReferences } from './validation-ast-runtime-input-contract'

describe('Validation AST runtime input projection', () => {
  it('compares each referenced action identity once when scenarios reuse an action', () => {
    expect(
      uniqueProjectedActionReferences([
        {
          steps: [
            { templateStepName: 'browser.navigation.goto@1' },
            { templateStepName: 'browser.waits.page-ready@1' },
            { templateStepName: 'browser.navigation.reload@1' },
            { templateStepName: 'browser.waits.page-ready@1' },
          ],
        },
      ]),
    ).toEqual(['browser.navigation.goto@1', 'browser.waits.page-ready@1', 'browser.navigation.reload@1'])
  })
})
