import { describe, expect, it } from 'vitest'

import { computeStepReferenceHash, dispatchStepInvocation, type StepDefinition, type StepInvocation } from './index.ts'

function definition(id: string, options: Partial<StepDefinition> = {}): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'dispatcher@test',
      createdAt: '2026-07-25T00:00:00.000Z',
      reviewedBy: 'dispatcher-review',
    },
    intent: {
      title: id,
      description: id,
      capabilities: ['browser.navigation'],
      searchTerms: [],
      examples: ['Run it.'],
    },
    inputs: [],
    outputs: [],
    human: { signature: `I run ${id}`, keywordCompatibility: ['When'], parameterBindings: [], groupId: 'test' },
    agent: { summary: id, usageGuidance: id, examples: [{ intent: id, inputs: {} }] },
    execution: { kind: 'operation', handlerId: 'browser.waits.timeout', handlerVersion: '1', runtime: 'browser' },
    lifecycle: {},
    ...options,
  }
}

function reference(definition: StepDefinition) {
  return {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  }
}

function invocation(definition: StepDefinition, inputs: Record<string, unknown> = {}): StepInvocation {
  return { step: reference(definition), inputs }
}

describe('Step Invocation dispatcher', () => {
  it('dispatches an exact built-in operation instead of a root operation string', async () => {
    const builtin = definition('wait', {
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
      agent: { summary: 'wait', usageGuidance: 'wait', examples: [{ intent: 'wait', inputs: { timeout: 1 } }] },
    })
    const calls: number[] = []
    await dispatchStepInvocation({
      invocation: invocation(builtin, { timeout: 7 }),
      sealedDefinitions: [{ step: reference(builtin), definition: builtin }],
      context: {
        world: { page: { waitForTimeout: async (value: number) => void calls.push(value) } } as never,
        resolveLocator: () => {
          throw new Error('unused')
        },
      },
    })
    expect(calls).toEqual([7])
  })

  it('resolves sealed environment inputs before validating the handler value type', async () => {
    const builtin = definition('environment-wait', {
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
      agent: { summary: 'wait', usageGuidance: 'wait', examples: [{ intent: 'wait', inputs: { timeout: 1 } }] },
    })
    const calls: number[] = []
    await dispatchStepInvocation({
      invocation: invocation(builtin, { timeout: { ref: 'environment', key: 'timeout' } }),
      sealedDefinitions: [{ step: reference(builtin), definition: builtin }],
      context: {
        world: { page: { waitForTimeout: async (value: number) => void calls.push(value) } } as never,
        resolveLocator: () => {
          throw new Error('unused')
        },
        environment: { timeout: 9 },
      },
    })
    expect(calls).toEqual([9])
  })

  it('runs composition children in order and maps parent inputs and earlier outputs', async () => {
    const first = definition('extension.first', {
      inputs: [
        {
          name: 'prefix',
          label: 'Prefix',
          description: 'Prefix.',
          type: 'string',
          required: true,
          examples: ['a'],
          aliases: [],
        },
      ],
      outputs: [{ name: 'value', description: 'Value.', type: 'string', storable: true }],
      agent: { summary: 'first', usageGuidance: 'first', examples: [{ intent: 'first', inputs: { prefix: 'a' } }] },
      execution: {
        kind: 'reviewed-extension',
        extensionId: 'extension.first',
        extensionVersion: '1',
        exportName: 'handler',
        sourceHash: `sha256:${'a'.repeat(64)}`,
        compiledHash: `sha256:${'b'.repeat(64)}`,
        runtime: 'node',
      },
    })
    const second = definition('extension.second', {
      inputs: [
        {
          name: 'value',
          label: 'Value',
          description: 'Value.',
          type: 'string',
          required: true,
          examples: ['a1'],
          aliases: [],
        },
      ],
      outputs: [{ name: 'result', description: 'Result.', type: 'string', storable: true }],
      agent: { summary: 'second', usageGuidance: 'second', examples: [{ intent: 'second', inputs: { value: 'a1' } }] },
      execution: {
        kind: 'reviewed-extension',
        extensionId: 'extension.second',
        extensionVersion: '1',
        exportName: 'handler',
        sourceHash: `sha256:${'c'.repeat(64)}`,
        compiledHash: `sha256:${'d'.repeat(64)}`,
        runtime: 'node',
      },
    })
    const parent = definition('composition.parent', {
      inputs: [
        {
          name: 'prefix',
          label: 'Prefix',
          description: 'Prefix.',
          type: 'string',
          required: true,
          examples: ['a'],
          aliases: [],
        },
      ],
      outputs: [{ name: 'result', description: 'Result.', type: 'string', storable: true }],
      agent: { summary: 'parent', usageGuidance: 'parent', examples: [{ intent: 'parent', inputs: { prefix: 'a' } }] },
      execution: {
        kind: 'composition',
        steps: [
          { step: reference(first), inputs: { prefix: { input: 'prefix' } } },
          { step: reference(second), inputs: { value: { output: 'value' } } },
        ],
      },
    })
    ;(globalThis as typeof globalThis & { dispatcherOrder?: string[] }).dispatcherOrder = []
    const source = (name: string, body: string) =>
      `data:text/javascript,export async function handler(inputs){globalThis.dispatcherOrder.push('${name}');${body}}`
    await expect(
      dispatchStepInvocation({
        invocation: invocation(parent, { prefix: 'x' }),
        sealedDefinitions: [parent, first, second].map(definition => ({ step: reference(definition), definition })),
        context: {
          world: { page: {} } as never,
          resolveLocator: () => {
            throw new Error('unused')
          },
          extensionModules: {
            'extension.first@1': source('first', 'return {value:inputs.prefix+"1"}'),
            'extension.second@1': source('second', 'return {result:inputs.value+"2"}'),
          },
        },
      }),
    ).resolves.toEqual({ result: 'x12' })
    expect((globalThis as typeof globalThis & { dispatcherOrder?: string[] }).dispatcherOrder).toEqual([
      'first',
      'second',
    ])
  })

  it('rejects tampered and missing child closure definitions', async () => {
    const child = definition('child')
    const parent = definition('parent', {
      execution: { kind: 'composition', steps: [{ step: reference(child), inputs: {} }] },
    })
    await expect(
      dispatchStepInvocation({
        invocation: invocation(parent),
        sealedDefinitions: [{ step: reference(parent), definition: parent }],
        context: {
          world: { page: {} } as never,
          resolveLocator: () => {
            throw new Error('unused')
          },
        },
      }),
    ).rejects.toThrow(/not sealed/)
    await expect(
      dispatchStepInvocation({
        invocation: invocation(child),
        sealedDefinitions: [
          { step: reference(child), definition: { ...child, intent: { ...child.intent, title: 'tampered' } } },
        ],
        context: {
          world: { page: {} } as never,
          resolveLocator: () => {
            throw new Error('unused')
          },
        },
      }),
    ).rejects.toThrow(/tampered/)
  })
})
