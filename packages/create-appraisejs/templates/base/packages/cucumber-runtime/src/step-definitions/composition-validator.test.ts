import { describe, expect, it } from 'vitest'

import {
  computeStepReferenceHash,
  validateStepDefinitionComposition,
  type ResolvedStepDefinition,
  type StepDefinition,
} from './index.ts'

function definition(id: string, options: Partial<StepDefinition> = {}): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'author@example.test',
      createdAt: '2026-07-24T00:00:00.000Z',
      reviewedBy: 'reviewer@example.test',
    },
    intent: {
      title: id,
      description: id,
      capabilities: ['browser.navigation'],
      searchTerms: [],
      examples: ['Use it.'],
    },
    inputs: [
      {
        name: 'value',
        label: 'Value',
        description: 'A value.',
        type: 'string',
        required: true,
        examples: ['value'],
        aliases: [],
      },
    ],
    outputs: [],
    human: {
      signature: `I use ${id} {value}`,
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'value', input: 'value' }],
      groupId: 'test',
    },
    agent: { summary: id, usageGuidance: id, examples: [{ intent: id, inputs: { value: 'value' } }] },
    execution: { kind: 'operation', handlerId: id, handlerVersion: '1', runtime: 'browser' },
    lifecycle: {},
    ...options,
  }
}

function composition(
  id: string,
  steps: Array<{ step: { id: string; version: string; definitionHash: string }; inputs: Record<string, unknown> }>,
  options: Partial<StepDefinition> = {},
) {
  return definition(id, {
    execution: { kind: 'composition', steps } as StepDefinition['execution'],
    ...options,
  })
}

function reference(definition: StepDefinition) {
  return { ...definition.identity, definitionHash: computeStepReferenceHash(definition) }
}

function resolved(
  ...definitions: Array<StepDefinition | [StepDefinition, 'ready' | 'deprecated']>
): ResolvedStepDefinition[] {
  return definitions.map(entry => {
    const [definition, status] = Array.isArray(entry) ? entry : [entry, 'ready']
    return { definition, status: status as 'ready' | 'deprecated' }
  })
}

describe('Step Definition composition validator', () => {
  it('accepts a valid typed composition', () => {
    const child = definition('child.one')
    const parent = composition('parent.valid', [{ step: reference(child), inputs: { value: { input: 'value' } } }])

    expect(validateStepDefinitionComposition(parent, resolved(child))).toEqual([])
  })

  it('rejects missing and deprecated exact children', () => {
    const child = definition('child.deprecated')
    const parent = composition('parent.children', [
      {
        step: { id: 'child.missing', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
        inputs: { value: 'value' },
      },
      { step: reference(child), inputs: { value: 'value' } },
    ])

    expect(validateStepDefinitionComposition(parent, resolved([child, 'deprecated']))).toMatchObject([
      { code: 'composition.child.missing', path: 'execution.steps.0.step' },
      { code: 'composition.child.not-ready', path: 'execution.steps.1.step' },
    ])
  })

  it('rejects direct and transitive cycles once per reachable cycle edge', () => {
    const direct = composition('parent.direct', [
      {
        step: { id: 'parent.direct', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
        inputs: { value: 'value' },
      },
    ])
    const middle = composition('parent.middle', [
      {
        step: { id: 'parent.direct', version: '1', definitionHash: `sha256:${'a'.repeat(64)}` },
        inputs: { value: 'value' },
      },
    ])
    const root = composition('parent.root', [{ step: reference(middle), inputs: { value: 'value' } }])

    expect(validateStepDefinitionComposition(direct, resolved(direct))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.cycle' })]),
    )
    expect(validateStepDefinitionComposition(root, resolved(middle, direct))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.cycle' })]),
    )
  })

  it('rejects incomplete and unknown child mappings with deterministic ordering', () => {
    const child = definition('child.mapping')
    const parent = composition('parent.mapping', [{ step: reference(child), inputs: { unknown: 'x' } }])
    const diagnostics = validateStepDefinitionComposition(parent, resolved(child))

    expect(diagnostics).toMatchObject([
      { code: 'composition.input.unknown', path: 'execution.steps.0.inputs.unknown' },
      { code: 'composition.input.required', path: 'execution.steps.0.inputs.value' },
    ])
    expect(diagnostics).toEqual(
      [...diagnostics].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
    )
  })

  it('rejects incompatible literal and parent-input mappings, including optional parent inputs', () => {
    const child = definition('child.typed')
    const parent = composition('parent.typed', [{ step: reference(child), inputs: { value: { input: 'optional' } } }], {
      inputs: [
        { ...child.inputs[0]!, name: 'optional', required: false },
        { ...child.inputs[0]!, name: 'numberValue', type: 'number', examples: [1] },
      ],
      agent: { ...definition('parent.agent').agent, examples: [{ intent: 'parent', inputs: { numberValue: 1 } }] },
    })
    const literal = composition('parent.literal', [{ step: reference(child), inputs: { value: 1 } }])

    expect(validateStepDefinitionComposition(parent, resolved(child))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.input.parent-optional' })]),
    )
    expect(validateStepDefinitionComposition(literal, resolved(child))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.input.literal-type' })]),
    )
  })

  it('uses directional reference compatibility: nominal matches and source-to-json widening are valid', () => {
    const numberChild = definition('child.number', {
      inputs: [{ ...definition('template').inputs[0]!, type: 'number', examples: [1] }],
      agent: { ...definition('template-agent').agent, examples: [{ intent: 'number', inputs: { value: 1 } }] },
      outputs: [{ name: 'numberResult', description: 'Number.', type: 'number', storable: true }],
    })
    const jsonChild = definition('child.json', {
      inputs: [{ ...numberChild.inputs[0]!, type: 'json', examples: [{ ok: true }] }],
      agent: { ...numberChild.agent, examples: [{ intent: 'json', inputs: { value: { ok: true } } }] },
    })
    const parent = composition(
      'parent.reference-compatible',
      [
        { step: reference(numberChild), inputs: { value: { input: 'numberValue' } } },
        { step: reference(jsonChild), inputs: { value: { input: 'numberValue' } } },
        { step: reference(jsonChild), inputs: { value: { output: 'numberResult' } } },
      ],
      {
        inputs: [{ ...numberChild.inputs[0]!, name: 'numberValue' }],
        agent: { ...definition('parent-agent').agent, examples: [{ intent: 'parent', inputs: { numberValue: 1 } }] },
      },
    )

    expect(validateStepDefinitionComposition(parent, resolved(numberChild, jsonChild))).toEqual([])
  })

  it('rejects json-to-narrower references and malformed selector values exhaustively', () => {
    const stringChild = definition('child.string')
    const jsonProducer = definition('child.json-producer', {
      outputs: [{ name: 'jsonResult', description: 'JSON.', type: 'json', storable: true }],
    })
    const parent = composition(
      'parent.reference-invalid',
      [
        { step: reference(stringChild), inputs: { value: { input: 'jsonValue' } } },
        { step: reference(jsonProducer), inputs: { value: 'value' } },
        { step: reference(stringChild), inputs: { value: { output: 'jsonResult' } } },
        { step: reference(stringChild), inputs: { value: { input: 'value', output: 'jsonResult' } } },
        { step: reference(stringChild), inputs: { value: { input: 'value', extra: true } } },
        { step: reference(stringChild), inputs: { value: { input: 1 } } },
      ],
      {
        inputs: [
          { ...stringChild.inputs[0]!, name: 'jsonValue', type: 'json', examples: [{ ok: true }] },
          { ...stringChild.inputs[0]!, name: 'value' },
        ],
        agent: {
          ...definition('parent-agent').agent,
          examples: [{ intent: 'parent', inputs: { jsonValue: { ok: true }, value: 'value' } }],
        },
      },
    )

    expect(validateStepDefinitionComposition(parent, resolved(stringChild, jsonProducer))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'composition.input.parent-type' }),
        expect.objectContaining({ code: 'composition.output.type' }),
        expect.objectContaining({ code: 'composition.input.expression.invalid' }),
      ]),
    )
    expect(
      validateStepDefinitionComposition(parent, resolved(stringChild, jsonProducer)).filter(
        diagnostic => diagnostic.code === 'composition.input.expression.invalid',
      ),
    ).toHaveLength(3)
  })

  it('rejects missing, forward, self, ambiguous, and incompatible output mappings', () => {
    const producer = definition('child.producer', {
      outputs: [{ name: 'result', description: 'Result.', type: 'string', storable: true }],
    })
    const consumer = definition('child.consumer')
    const numericConsumer = definition('child.numeric', {
      inputs: [{ ...consumer.inputs[0]!, type: 'number', examples: [1] }],
      agent: { ...consumer.agent, examples: [{ intent: 'numeric', inputs: { value: 1 } }] },
    })
    const parent = composition('parent.outputs', [
      { step: reference(consumer), inputs: { value: { output: 'missing' } } },
      { step: reference(producer), inputs: { value: 'x' } },
      { step: reference(consumer), inputs: { value: { output: 'result' } } },
      { step: reference(producer), inputs: { value: 'x' } },
      { step: reference(numericConsumer), inputs: { value: { output: 'result' } } },
    ])
    const self = composition('parent.self', [{ step: reference(producer), inputs: { value: { output: 'result' } } }])
    const forward = composition('parent.forward', [
      { step: reference(consumer), inputs: { value: { output: 'result' } } },
      { step: reference(producer), inputs: { value: 'x' } },
    ])
    const typed = composition('parent.typed-output', [
      { step: reference(producer), inputs: { value: 'x' } },
      { step: reference(numericConsumer), inputs: { value: { output: 'result' } } },
    ])

    expect(validateStepDefinitionComposition(parent, resolved(producer, consumer, numericConsumer))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'composition.output.missing' }),
        expect.objectContaining({ code: 'composition.output.ambiguous' }),
      ]),
    )
    expect(validateStepDefinitionComposition(self, resolved(producer))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.output.self' })]),
    )
    expect(validateStepDefinitionComposition(forward, resolved(producer, consumer))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.output.forward' })]),
    )
    expect(validateStepDefinitionComposition(typed, resolved(producer, numericConsumer))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.output.type' })]),
    )
  })

  it('rejects composition outputs until export mapping exists', () => {
    const child = definition('child.output')
    const parent = composition('parent.output', [{ step: reference(child), inputs: { value: 'value' } }], {
      outputs: [{ name: 'result', description: 'Result.', type: 'string', storable: true }],
    })

    expect(validateStepDefinitionComposition(parent, resolved(child))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.outputs.unsupported', path: 'outputs' })]),
    )
  })

  it('rejects a composition child whose exact reference hash does not match the ready definition', () => {
    const child = definition('child.hash')
    const parent = composition('parent.hash', [
      { step: { ...reference(child), definitionHash: `sha256:${'f'.repeat(64)}` }, inputs: { value: 'value' } },
    ])

    expect(validateStepDefinitionComposition(parent, resolved(child))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'composition.child.hash-mismatch' })]),
    )
  })
})
