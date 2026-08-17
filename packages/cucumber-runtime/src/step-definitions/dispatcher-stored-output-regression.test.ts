import { describe, expect, it } from 'vitest'

import { computeStepReferenceHash, dispatchStepInvocation, type StepDefinition } from './index.ts'

function waitDefinition(): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id: 'browser.wait-from-store', version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'dispatcher-regression@test',
      createdAt: '2026-07-25T00:00:00.000Z',
      reviewedBy: 'dispatcher-regression-review',
    },
    intent: {
      title: 'Wait from stored output',
      description: 'Wait for the stored timeout.',
      capabilities: ['browser.navigation'],
      searchTerms: [],
      examples: ['Wait for the stored timeout.'],
    },
    inputs: [
      {
        name: 'timeout',
        label: 'Timeout',
        description: 'Milliseconds.',
        type: 'number',
        required: true,
        examples: [1],
        aliases: [],
      },
    ],
    outputs: [],
    human: {
      signature: 'I wait {timeout}',
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'timeout', input: 'timeout' }],
      groupId: 'test',
    },
    agent: { summary: 'Wait.', usageGuidance: 'Wait.', examples: [{ intent: 'Wait.', inputs: { timeout: 1 } }] },
    execution: { kind: 'operation', handlerId: 'browser.waits.timeout', handlerVersion: '1', runtime: 'browser' },
    lifecycle: {},
  }
}

describe('Step Invocation stored output dispatch', () => {
  it('resolves stored references before validating the declared input type', async () => {
    const definition = waitDefinition()
    const calls: number[] = []
    await dispatchStepInvocation({
      invocation: {
        step: {
          id: definition.identity.id,
          version: definition.identity.version,
          definitionHash: computeStepReferenceHash(definition),
        },
        inputs: { timeout: { ref: 'stored', name: 'delay' } },
      },
      sealedDefinitions: [
        {
          step: {
            id: definition.identity.id,
            version: definition.identity.version,
            definitionHash: computeStepReferenceHash(definition),
          },
          definition,
        },
      ],
      context: {
        world: {
          page: { url: () => 'about:blank', waitForTimeout: async (value: number) => void calls.push(value) },
          appraiseStepOutputs: new Map([['delay', 7]]),
        } as never,
        resolveLocator: () => {
          throw new Error('unused')
        },
      },
    })
    expect(calls).toEqual([7])
  })
})
