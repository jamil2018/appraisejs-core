import { describe, expect, it } from 'vitest'

import {
  templateTestCaseStepCreates,
  testCaseStepCreates,
  type AuthoredStep,
} from '@/services/shared/authored-step-persistence'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
  type StepDefinition,
  type StepInvocation,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const definition = builtInStepDefinitions.find(candidate =>
  candidate.inputs.some(input => input.required),
) as StepDefinition
const typedDefinition = builtInStepDefinitions.find(candidate =>
  candidate.inputs.some(input => input.required && (input.type === 'number' || input.type === 'boolean')),
) as StepDefinition

function inputValue(type: StepDefinition['inputs'][number]['type']): unknown {
  if (type === 'number') return 1
  if (type === 'boolean') return true
  if (type === 'json') return { value: true }
  return 'value'
}

function invocation(inputs: Record<string, unknown>, selectedDefinition = definition): StepInvocation {
  return {
    step: {
      id: selectedDefinition.identity.id,
      version: selectedDefinition.identity.version,
      definitionHash: computeStepReferenceHash(selectedDefinition),
    },
    inputs,
  }
}

function requiredInputs(selectedDefinition = definition): Record<string, unknown> {
  return Object.fromEntries(
    selectedDefinition.inputs.filter(input => input.required).map(input => [input.name, inputValue(input.type)]),
  )
}

function authoredStep(inputs: Record<string, unknown>): AuthoredStep {
  return {
    gherkinStep: 'Given an authored step',
    invocation: invocation(inputs),
    order: 1,
    parameters: [],
  }
}

describe('authored Step Invocation persistence', () => {
  it('persists Test Case steps only when required typed inputs are supplied', () => {
    expect(() => testCaseStepCreates([authoredStep(requiredInputs())], [definition])).not.toThrow()

    expect(() => testCaseStepCreates([authoredStep({})], [definition])).toThrow(/missing required input/)
  })

  it('rejects unknown inputs before persisting Template Test Case steps', () => {
    expect(() =>
      templateTestCaseStepCreates([authoredStep({ ...requiredInputs(), unknown: 'value' })], [definition]),
    ).toThrow(/unknown input unknown/)
  })

  it('rejects wrong input types before persisting authored steps', () => {
    const typedInput = typedDefinition.inputs.find(
      input => input.required && (input.type === 'number' || input.type === 'boolean'),
    )
    if (!typedInput) throw new Error('Expected a built-in Step Definition with a typed required input.')

    expect(() =>
      testCaseStepCreates(
        [authoredStep({ ...requiredInputs(typedDefinition), [typedInput.name]: 'wrong type' })],
        [typedDefinition],
      ),
    ).toThrow(/wrong type/)
  })
})
