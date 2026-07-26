import { describe, expect, it } from 'vitest'

import { validationAstStepSchema } from './schemas'

describe('Validation AST presentation safety', () => {
  it('rejects multi-line presentation text before canonical Gherkin projection', () => {
    expect(
      validationAstStepSchema.safeParse({
        id: 'unsafe-step',
        invocation: {
          step: { id: 'browser.wait', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
          inputs: {},
          presentation: { keyword: 'Given', description: 'safe line\nScenario: injected' },
        },
      }).success,
    ).toBe(false)
  })
})
