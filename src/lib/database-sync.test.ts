import { describe, expect, it, vi } from 'vitest'

import { assertFeatureImportMetadata, createOrUpdateTestCaseStep } from '@/lib/database-sync'
import type { ParsedFeature } from '@/lib/gherkin-parser'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
  type StepDefinition,
} from '../../packages/cucumber-runtime/src/step-definitions/index.ts'

const definition = builtInStepDefinitions[0] as StepDefinition

function feature(invocation: unknown): ParsedFeature {
  return {
    filePath: '/features/checkout.feature',
    featureName: 'Checkout',
    tags: [],
    metadataWarnings: [],
    scenarios: [
      {
        name: 'Checkout succeeds',
        tags: [],
        steps: [{ keyword: 'Given', text: 'a ready browser', order: 0 }],
        appraiseMetadata: {
          identifierTag: '@tc_id_checkout',
          title: 'Checkout succeeds',
          description: '',
          nodes: [{ nodeId: 'node-1', order: 0, label: 'ready browser', invocation }],
          flowBlocks: [],
        },
      },
    ],
  }
}

describe('feature import metadata guard', () => {
  it('accepts an exact Step Invocation and rejects missing or malformed metadata before import', () => {
    const invocation = {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs: {},
    }

    expect(() => assertFeatureImportMetadata(feature(invocation))).not.toThrow()
    expect(() => assertFeatureImportMetadata(feature({}))).toThrow()

    const withoutMetadata = feature(invocation)
    withoutMetadata.scenarios[0]!.appraiseMetadata = undefined
    expect(() => assertFeatureImportMetadata(withoutMetadata)).toThrow(/requires Appraise metadata/)
  })

  it('rejects invalid typed inputs before feature-import step writes', async () => {
    const findFirst = vi.fn()
    const create = vi.fn()
    const update = vi.fn()
    const client = {
      stepDefinition: {
        findMany: vi.fn().mockResolvedValue([{ definitionJson: JSON.stringify(definition) }]),
      },
      testCaseStep: { findFirst, create, update },
    }
    const invocation = {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs: { unexpected: true },
    }

    await expect(
      createOrUpdateTestCaseStep(
        'test-case-1',
        {
          keyword: 'Given',
          text: 'a ready browser',
          order: 0,
          appraiseNode: { nodeId: 'node-1', order: 0, label: 'ready browser', invocation },
        },
        client as never,
      ),
    ).rejects.toThrow(/unknown input/)
    expect(findFirst).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
