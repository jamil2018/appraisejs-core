import { describe, expect, it } from 'vitest'

import definitions from '../operations/definitions.json'
import { builtInStepDefinitions } from './builtins.ts'
import { computeStepDefinitionHashes, stepDefinitionSchema } from './contracts.ts'

describe('built-in Step Definitions', () => {
  it('projects every built-in operation into one complete ready definition', () => {
    expect(builtInStepDefinitions).toHaveLength(definitions.length)
    expect(builtInStepDefinitions.every(definition => stepDefinitionSchema.safeParse(definition).success)).toBe(true)
    expect(
      new Set(builtInStepDefinitions.map(definition => `${definition.identity.id}@${definition.identity.version}`))
        .size,
    ).toBe(definitions.length)
  })

  it('preserves visible signatures, parameter order, and handler identity', () => {
    for (const [index, source] of definitions.entries()) {
      const definition = builtInStepDefinitions[index]!
      expect(definition.human.signature).toBe(source.humanProjections[0]?.signature)
      expect(definition.human.parameterBindings.map(binding => binding.input)).toEqual(
        source.humanProjections[0]?.parameterOrder,
      )
      expect(definition.execution).toMatchObject({
        kind: 'operation',
        handlerId: source.handler.id,
        handlerVersion: source.handler.version,
        runtime: source.runtime,
      })
      expect(computeStepDefinitionHashes(definition).definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    }
  })
})
