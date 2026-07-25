import { describe, expect, it } from 'vitest'

import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const definition = builtInStepDefinitions[0] as StepDefinition
const client = {
  stepDefinition: {
    findMany: async () => [{ definitionJson: JSON.stringify(definition) }],
  },
}

describe('ready exact Step Definition resolution', () => {
  it('accepts only the canonical full Step Reference hash', async () => {
    const exact = {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs: {},
    }
    const semanticHash = {
      ...exact,
      step: { ...exact.step, definitionHash: computeStepDefinitionHashes(definition).definitionHash },
    }

    expect(await resolveReadyExactStepDefinitions([{ invocation: exact }], client as never)).toEqual([definition])
    expect(await resolveReadyExactStepDefinitions([{ invocation: semanticHash }], client as never)).toBeNull()
  })
})
