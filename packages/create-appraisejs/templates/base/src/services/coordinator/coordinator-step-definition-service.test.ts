import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'

const prismaMocks = vi.hoisted(() => ({
  stepDefinitionSearchReceipt: { create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000010' }) },
}))

vi.mock('@/config/db-config', () => ({ default: prismaMocks }))

vi.mock('@/services/step-definition/step-definition-telemetry', () => ({
  recordStepDefinitionTelemetry: vi.fn().mockResolvedValue(undefined),
}))

import { coordinatorStepDefinitionService } from './coordinator-step-definition-service'
import { recordStepDefinitionTelemetry } from '@/services/step-definition/step-definition-telemetry'

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
    vi.spyOn(StepDefinitionRegistryService.prototype, 'listReadyForSearch').mockResolvedValue([
      {
        id: definition.identity.id,
        version: definition.identity.version,
        title: definition.intent.title,
        description: definition.intent.description,
        definitionJson: JSON.stringify(definition),
      },
    ])

    await expect(
      coordinatorStepDefinitionService.read(['step-definitions', 'search'], new URLSearchParams({ surface: 'human' })),
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
    expect(recordStepDefinitionTelemetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ surface: 'human', outcome: 'query_match' }),
    )
  })

  it('records bounded selection rejection events without query or input content', async () => {
    await expect(
      coordinatorStepDefinitionService.recordSelectionRejected({
        surface: 'agent',
        step: { id: 'browser.search.exact', version: '1' },
        reason: 'parameter_mismatch',
      }),
    ).resolves.toEqual({ recorded: true })
    expect(recordStepDefinitionTelemetry).toHaveBeenCalledWith(expect.anything(), {
      surface: 'agent',
      outcome: 'selection_rejected',
      step: { id: 'browser.search.exact', version: '1' },
      payload: { reason: 'parameter_mismatch' },
    })
  })

  it('does not expose review, publication, or deprecation through the coordinator write boundary', async () => {
    const revision = 1
    const draftId = '00000000-0000-4000-8000-000000000001'
    for (const operation of [
      ['step-definitions', 'drafts', draftId, 'review'],
      ['step-definitions', 'drafts', draftId, 'publish'],
      ['step-definitions', 'definitions', 'browser.search.exact', '1', 'deprecate'],
    ])
      await expect(
        coordinatorStepDefinitionService.write(operation, { expectedRevision: revision, reviewAuthority: 'forged' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
