import { describe, expect, it } from 'vitest'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

import { uniqueProjectedOperationReferences } from './validation-ast-runtime-input-contract'

describe('Validation AST runtime input projection', () => {
  it('compares each exact referenced Step Definition once when scenarios reuse an invocation', () => {
    const definition = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.reload')!
    const invocation = {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs: {},
    }
    expect(
      uniqueProjectedOperationReferences([
        {
          id: 'case',
          steps: [
            { id: 'one', invocation },
            { id: 'two', invocation },
          ],
        },
      ]),
    ).toEqual(['browser.navigation.reload@1'])
  })
})
