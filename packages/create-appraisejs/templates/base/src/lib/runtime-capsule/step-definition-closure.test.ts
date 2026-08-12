import { describe, expect, it } from 'vitest'

import {
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  computeStepReferenceHash,
  stepDefinitionContentHash,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import { resolveRuntimeStepDefinitionClosure, type RuntimeStepDefinitionRecord } from './step-definition-closure'

function definition(id: string, execution: StepDefinition['execution']): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'test',
      createdAt: '2026-07-25T00:00:00.000Z',
      reviewedBy: 'reviewer',
    },
    intent: {
      title: id,
      description: `Definition for ${id}.`,
      capabilities: ['browser'],
      searchTerms: [],
      examples: [`Use ${id}.`],
    },
    inputs: [],
    outputs: [],
    human: { signature: `I run ${id}`, keywordCompatibility: ['When'], parameterBindings: [], groupId: 'test' },
    agent: { summary: `Run ${id}.`, usageGuidance: `Use ${id}.`, examples: [{ intent: `Run ${id}.`, inputs: {} }] },
    execution,
    lifecycle: {},
  }
}

function record(value: StepDefinition): RuntimeStepDefinitionRecord {
  const hashes = computeStepDefinitionHashes(value)
  const registryManifestHash = stepDefinitionContentHash({ step: value.identity })
  const receipt = {
    step: { id: value.identity.id, version: value.identity.version },
    ...hashes,
    registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(value, registryManifestHash, 'test-run'),
    conformanceRunId: 'test-run',
    reviewAuthority: 'test-reviewer',
    publishedAt: '2026-07-25T00:00:00.000Z',
  }
  return {
    status: 'ready',
    definitionJson: JSON.stringify(value),
    definitionHash: hashes.definitionHash,
    humanProjectionHash: hashes.humanProjectionHash,
    agentContractHash: hashes.agentContractHash,
    executionHash: hashes.executionHash,
    publicationReceipt: {
      receiptHash: stepDefinitionContentHash(receipt),
      receiptJson: JSON.stringify(receipt),
    },
  }
}

describe('runtime Step Definition closure', () => {
  it('seals an exact deterministic composition closure with publication hashes', async () => {
    const child = definition('browser.child', {
      kind: 'operation',
      handlerId: 'browser.click',
      handlerVersion: '1',
      runtime: 'browser',
    })
    const parent = definition('browser.parent', {
      kind: 'composition',
      steps: [
        {
          step: {
            id: child.identity.id,
            version: child.identity.version,
            definitionHash: computeStepReferenceHash(child),
          },
          inputs: {},
        },
      ],
    })
    const rows = new Map([
      ['browser.child@1', record(child)],
      ['browser.parent@1', record(parent)],
    ])
    const closure = await resolveRuntimeStepDefinitionClosure(
      [{ id: parent.identity.id, version: parent.identity.version, definitionHash: computeStepReferenceHash(parent) }],
      async step => rows.get(`${step.id}@${step.version}`) ?? null,
    )

    expect(closure.map(item => item.step.id)).toEqual(['browser.child', 'browser.parent'])
    expect(closure.every(item => item.hashes.publicationReceipt.startsWith('sha256:'))).toBe(true)
  })

  it('rejects stale exact references and unresolved composition cycles', async () => {
    const stale = definition('browser.stale', {
      kind: 'operation',
      handlerId: 'browser.click',
      handlerVersion: '1',
      runtime: 'browser',
    })
    await expect(
      resolveRuntimeStepDefinitionClosure(
        [{ id: stale.identity.id, version: stale.identity.version, definitionHash: `sha256:${'0'.repeat(64)}` }],
        async () => record(stale),
      ),
    ).rejects.toThrow(/exact reference hash/)

    const hash = `sha256:${'a'.repeat(64)}`
    const cyclic = definition('browser.cyclic', {
      kind: 'composition',
      steps: [{ step: { id: 'browser.cyclic', version: '1', definitionHash: hash }, inputs: {} }],
    })
    const cyclicRecord = record(cyclic)
    await expect(
      resolveRuntimeStepDefinitionClosure([{ id: 'browser.cyclic', version: '1', definitionHash: hash }], async () => ({
        ...cyclicRecord,
        definitionJson: JSON.stringify(cyclic),
      })),
    ).rejects.toThrow(/exact reference hash|cycle/)
  })

  it('repairs the former compiler hash shape when it matches the sealed persisted definition', async () => {
    const ready = definition('browser.compiler-hash', {
      kind: 'operation',
      handlerId: 'browser.click',
      handlerVersion: '1',
      runtime: 'browser',
    })
    const persisted = record(ready)
    const closure = await resolveRuntimeStepDefinitionClosure(
      [{ id: ready.identity.id, version: ready.identity.version, definitionHash: persisted.definitionHash }],
      async () => persisted,
    )

    expect(closure[0]?.step.definitionHash).toBe(computeStepReferenceHash(ready))
  })

  it('rejects a persisted publication hash that does not match the sealed definition', async () => {
    const ready = definition('browser.tampered', {
      kind: 'operation',
      handlerId: 'browser.click',
      handlerVersion: '1',
      runtime: 'browser',
    })
    const ref = {
      id: ready.identity.id,
      version: ready.identity.version,
      definitionHash: computeStepReferenceHash(ready),
    }
    await expect(
      resolveRuntimeStepDefinitionClosure([ref], async () => ({
        ...record(ready),
        executionHash: `sha256:${'0'.repeat(64)}`,
      })),
    ).rejects.toThrow(/publication hashes/)
  })

  it('authenticates receipt bytes and resolves an exact deprecated publication', async () => {
    const ready = definition('browser.historical', {
      kind: 'operation',
      handlerId: 'browser.click',
      handlerVersion: '1',
      runtime: 'browser',
    })
    const ref = {
      id: ready.identity.id,
      version: ready.identity.version,
      definitionHash: computeStepReferenceHash(ready),
    }
    await expect(
      resolveRuntimeStepDefinitionClosure([ref], async () => ({ ...record(ready), status: 'deprecated' })),
    ).resolves.toHaveLength(1)
    await expect(
      resolveRuntimeStepDefinitionClosure([ref], async () => ({
        ...record(ready),
        publicationReceipt: {
          ...record(ready).publicationReceipt!,
          receiptHash: `sha256:${'0'.repeat(64)}`,
        },
      })),
    ).rejects.toThrow(/publication evidence/)
  })
})
