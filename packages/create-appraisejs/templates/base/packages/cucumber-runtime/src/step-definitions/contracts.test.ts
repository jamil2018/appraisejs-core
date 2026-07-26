import { describe, expect, it } from 'vitest'

import {
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionContentHash,
  stepDefinitionSchema,
  stepInputExpressionSchema,
  stepInvocationSchema,
  type StepDefinition,
} from './contracts.ts'

function definition(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id: 'browser.navigation.open', version: '1', status: 'draft' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'author@example.test',
      createdAt: '2026-07-22T00:00:00.000Z',
    },
    intent: {
      title: 'Open a page',
      description: 'Navigates the active browser page to an explicit URL.',
      capabilities: ['browser.navigation'],
      searchTerms: ['navigate', 'open page'],
      examples: ['Open the account settings page.'],
    },
    inputs: [
      {
        name: 'url',
        label: 'URL',
        description: 'The absolute URL to open.',
        type: 'string',
        required: true,
        examples: ['https://example.test/settings'],
        aliases: ['destination'],
      },
    ],
    outputs: [],
    human: {
      signature: 'I navigate to {url}',
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'url', input: 'url' }],
      groupId: 'navigation',
    },
    agent: {
      summary: 'Open an absolute URL in the active browser page.',
      usageGuidance: 'Use this when the destination is known explicitly.',
      examples: [{ intent: 'Open account settings', inputs: { url: 'https://example.test/settings' } }],
    },
    execution: { kind: 'unbound' },
    lifecycle: {},
    ...overrides,
  }
}

describe('step definition contracts', () => {
  it('canonicalizes and hashes object keys deterministically', () => {
    expect(canonicalStepDefinitionJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}')
    expect(stepDefinitionContentHash({ z: 1, a: 2 })).toBe(stepDefinitionContentHash({ a: 2, z: 1 }))
  })

  it('uses separate integrity domains for projections and execution', () => {
    const parsed = stepDefinitionSchema.parse(definition())
    const hashes = computeStepDefinitionHashes(parsed)

    expect(new Set(Object.values(hashes)).size).toBe(4)
    expect(Object.values(hashes).every(hash => /^sha256:[a-f0-9]{64}$/.test(hash))).toBe(true)
  })

  it('binds the exact execution contract into the definition hash', () => {
    const first = stepDefinitionSchema.parse(
      definition({
        execution: {
          kind: 'operation',
          handlerId: 'browser.navigation.open',
          handlerVersion: '1',
          runtime: 'browser',
        },
      }),
    )
    const second = stepDefinitionSchema.parse({
      ...first,
      execution: { ...first.execution, handlerVersion: '2' },
    })

    expect(computeStepReferenceHash(second)).not.toBe(computeStepReferenceHash(first))
  })

  it('rejects an executable lifecycle without a binding or review authority', () => {
    const result = stepDefinitionSchema.safeParse(
      definition({ identity: { id: 'browser.navigation.open', version: '1', status: 'ready' } }),
    )

    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.message)).toEqual(
      expect.arrayContaining([
        'Ready and deprecated definitions require an execution binding.',
        'Ready definitions require review authority.',
      ]),
    )
  })

  it('rejects ambiguous aliases and incomplete agent examples', () => {
    const candidate = definition()
    candidate.inputs.push({
      name: 'timeout',
      label: 'Timeout',
      description: 'Maximum wait in milliseconds.',
      type: 'number',
      required: true,
      examples: [1_000],
      aliases: ['url'],
    })

    const result = stepDefinitionSchema.safeParse(candidate)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.message)).toEqual(
      expect.arrayContaining([
        'Input names and aliases must not overlap.',
        'Agent example is missing required input timeout.',
      ]),
    )
  })

  it('accepts only exact immutable references in new invocations', () => {
    expect(
      stepInvocationSchema.parse({
        step: {
          id: 'browser.navigation.open',
          version: '1',
          definitionHash: `sha256:${'a'.repeat(64)}`,
        },
        inputs: { url: 'https://example.test' },
        presentation: { keyword: 'When' },
      }),
    ).toMatchObject({ step: { id: 'browser.navigation.open', version: '1' } })

    expect(() =>
      stepInvocationSchema.parse({
        action: 'navigate',
        inputs: { url: 'https://example.test' },
      }),
    ).toThrow()
  })

  it('exports exact composition input selectors and rejects selector-shaped literals', () => {
    expect(stepInputExpressionSchema.parse({ input: 'parentValue' })).toEqual({ input: 'parentValue' })
    expect(stepInputExpressionSchema.parse({ output: 'priorValue' })).toEqual({ output: 'priorValue' })
    expect(stepInputExpressionSchema.safeParse({ input: 'parentValue', output: 'priorValue' }).success).toBe(false)
    expect(stepInputExpressionSchema.safeParse({ input: 'parentValue', extra: true }).success).toBe(false)
    expect(stepInputExpressionSchema.safeParse({ input: 1 }).success).toBe(false)
    expect(stepInputExpressionSchema.safeParse({ output: null }).success).toBe(false)
  })

  it('requires an immutable hash for every composition child reference', () => {
    const missingHash = definition({
      execution: {
        kind: 'composition',
        steps: [{ step: { id: 'browser.navigation.open', version: '1' }, inputs: { url: { input: 'url' } } }],
      } as never,
    })
    const exactReference = definition({
      execution: {
        kind: 'composition',
        steps: [
          {
            step: { id: 'browser.navigation.open', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
            inputs: { url: { input: 'url' } },
          },
        ],
      },
    })

    expect(stepDefinitionSchema.safeParse(missingHash).success).toBe(false)
    expect(stepDefinitionSchema.safeParse(exactReference).success).toBe(true)
  })
})
