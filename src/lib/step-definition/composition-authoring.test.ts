import { describe, expect, it } from 'vitest'

import {
  compositionChildFromContract,
  normalizeCompositionChildren,
  type ReadyCompositionChildContract,
} from './composition-authoring'

const definitionHash = `sha256:${'a'.repeat(64)}`

const readyChild: ReadyCompositionChildContract = {
  step: { id: 'browser.search.exact', version: '1', definitionHash },
  title: 'Search exactly',
  description: 'Runs an exact search.',
  inputs: [
    {
      name: 'query',
      label: 'Query',
      description: 'The search query.',
      type: 'string',
      required: true,
      examples: ['AppraiseJS'],
      aliases: [],
    },
  ],
  outputs: [{ name: 'result', description: 'The returned result.', type: 'string', storable: true }],
}

describe('composition authoring', () => {
  it('preserves an exact ready child reference and typed parent/output mappings', () => {
    const child = compositionChildFromContract(readyChild)

    expect(child).toEqual({ step: readyChild.step, inputs: {} })
    expect(
      normalizeCompositionChildren([
        {
          ...child,
          inputs: { query: { input: 'parentQuery' }, followUp: { output: 'result' } },
        },
      ]),
    ).toEqual([
      {
        step: readyChild.step,
        inputs: { query: { input: 'parentQuery' }, followUp: { output: 'result' } },
      },
    ])
  })

  it('allows a draft to be temporarily empty but rejects malformed child mappings', () => {
    expect(normalizeCompositionChildren([])).toEqual([])
    expect(() =>
      normalizeCompositionChildren([{ step: readyChild.step, inputs: { query: { input: 'not valid' } } }]),
    ).toThrow(/Invalid/)
  })
})
