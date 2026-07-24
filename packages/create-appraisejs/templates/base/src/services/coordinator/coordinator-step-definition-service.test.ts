import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'

import { coordinatorStepDefinitionService } from './coordinator-step-definition-service'

function readyDefinition(): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id: 'browser.search.exact', version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'built-in-source',
      createdBy: 'search-test',
      createdAt: '2026-07-25T00:00:00.000Z',
      reviewedBy: 'appraise-built-in-registry',
    },
    intent: {
      title: 'Exact searchable step',
      description: 'Verifies the reusable search contract.',
      capabilities: ['browser.search'],
      searchTerms: ['exact'],
      examples: ['Use the exact step.'],
    },
    inputs: [
      {
        name: 'query',
        label: 'Query',
        description: 'The exact search query.',
        type: 'string',
        required: true,
        examples: ['AppraiseJS'],
        aliases: [],
      },
    ],
    outputs: [{ name: 'result', description: 'The exact result.', type: 'string', storable: true }],
    human: {
      signature: 'I use the exact searchable step for {query}',
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'query', input: 'query' }],
      groupId: 'search-test',
    },
    agent: {
      summary: 'Use the exact searchable step.',
      usageGuidance: 'Use the returned Step Reference directly.',
      examples: [{ intent: 'Search exactly', inputs: { query: 'AppraiseJS' } }],
    },
    execution: {
      kind: 'operation',
      handlerId: 'browser.search.exact',
      handlerVersion: '1',
      runtime: 'browser',
    },
    lifecycle: {},
  }
}

afterEach(() => vi.restoreAllMocks())

describe('coordinator Step Definition search', () => {
  it('returns the aggregate exact Step Reference while retaining per-domain audit hashes', async () => {
    const definition = readyDefinition()
    const hashes = computeStepDefinitionHashes(definition)
    vi.spyOn(StepDefinitionRegistryService.prototype, 'list').mockResolvedValue([
      {
        id: definition.identity.id,
        version: definition.identity.version,
        status: 'ready',
        title: definition.intent.title,
        description: definition.intent.description,
        definitionJson: JSON.stringify(definition),
        definitionHash: hashes.definitionHash,
        humanProjectionHash: hashes.humanProjectionHash,
        agentContractHash: hashes.agentContractHash,
        executionHash: hashes.executionHash,
        provenanceJson: JSON.stringify(definition.provenance),
        createdAt: new Date(definition.provenance.createdAt),
        publishedAt: new Date(definition.provenance.createdAt),
        deprecatedAt: null,
        humanProjection: {
          stepId: definition.identity.id,
          stepVersion: definition.identity.version,
          signature: definition.human.signature,
          groupId: definition.human.groupId,
          projectionJson: JSON.stringify(definition.human),
          projectionHash: hashes.humanProjectionHash,
        },
        executionBinding: {
          stepId: definition.identity.id,
          stepVersion: definition.identity.version,
          kind: 'operation',
          bindingJson: JSON.stringify(definition.execution),
          bindingHash: hashes.executionHash,
        },
        publicationReceipt: null,
      },
    ])

    await expect(
      coordinatorStepDefinitionService.read(['step-definitions', 'search'], new URLSearchParams()),
    ).resolves.toMatchObject({
      body: {
        matches: [
          {
            step: { definitionHash: computeStepReferenceHash(definition) },
            inputs: definition.inputs,
            outputs: definition.outputs,
            hashes: { definition: hashes.definitionHash, execution: hashes.executionHash },
          },
        ],
      },
    })
  })
})
