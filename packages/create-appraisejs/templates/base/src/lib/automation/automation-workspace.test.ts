import { describe, expect, it } from 'vitest'

import { rewriteLegacyStepRuntimeImports } from './automation-workspace'

describe('automation workspace migration', () => {
  it('keeps structured operation helpers available when rewriting legacy step imports', () => {
    const migrated = rewriteLegacyStepRuntimeImports(`import { When } from '@cucumber/cucumber'

When('the user runs a structured operation', async function () {
  await runLocatorStepOperation(this.page.locator('main'), 'click', '[]', '{}', () => undefined)
  await runPageStepOperation(this.page, 'reload', '[]', '{}', () => undefined)
})
`)

    expect(migrated).toContain('runLocatorStepOperation')
    expect(migrated).toContain('runPageStepOperation')
    expect(migrated).not.toContain("from '@cucumber/cucumber'")

    const ordinaryStep = rewriteLegacyStepRuntimeImports(
      "import { When } from '@cucumber/cucumber'\n\nWhen('the user waits', async function () {})\n",
    )
    expect(ordinaryStep).not.toContain('runLocatorStepOperation')
    expect(ordinaryStep).not.toContain('runPageStepOperation')

    const currentStep = `import {
  When,
  runPageStepOperation,
} from '../../../packages/cucumber-runtime/src/index.js'

When('the user reloads', async function () {
  await runPageStepOperation(this.page, 'reload', '[]', '{}', () => undefined)
})
`
    expect(rewriteLegacyStepRuntimeImports(currentStep)).toBe(currentStep)
  })

  it('preserves generated projection imports at their deeper directory level', () => {
    const generatedProjection = `import {
  CustomWorld,
  SelectorName,
  When,
  executeHumanOperation,
} from '../../../../packages/cucumber-runtime/src/index.js'

When('the user waits', async function (this: CustomWorld, target: SelectorName) {
  await executeHumanOperation('browser.wait@1', this, ['target'], [target])
})
`

    expect(rewriteLegacyStepRuntimeImports(generatedProjection)).toBe(generatedProjection)
  })
})
