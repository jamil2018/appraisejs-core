import { describe, expect, it } from 'vitest'

import { ensureRequiredImports } from './template-step-file-manager-intelligent'

describe('ensureRequiredImports', () => {
  it('does not duplicate a multiline runtime import used by generated projections', () => {
    const source = `import {
  CustomWorld,
  SelectorName,
  Then,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'

When('the user clicks {string}', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.pointer.click.element@1', this, ['target'], [target])
})
`

    const normalized = ensureRequiredImports(source)

    expect(normalized).toBe(source)
    expect(normalized.match(/packages\/cucumber-runtime\/src\/index\.js/g)).toHaveLength(1)
  })
})
