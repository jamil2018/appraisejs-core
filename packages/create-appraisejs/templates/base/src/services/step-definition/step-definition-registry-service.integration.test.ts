import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'

import { StepDefinitionRegistryService } from './step-definition-registry-service'
import {
  createReadySearchEvidence,
  readyStepDefinitionSearchIndexHash,
} from './ready-step-definition-search-index'

let workspace: string
let prisma: PrismaClient
let registry: StepDefinitionRegistryService

function definition(id = 'browser.navigation.open', signature = 'I wait for {timeout} milliseconds'): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'draft' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'author@example.test',
      createdAt: '2026-07-22T00:00:00.000Z',
    },
    intent: {
      title: 'Wait with timeout',
      description: 'Waits for a bounded number of milliseconds.',
      capabilities: ['browser.navigation'],
      searchTerms: ['wait'],
      examples: ['Wait briefly.'],
    },
    inputs: [
      {
        name: 'timeout',
        label: 'Timeout',
        description: 'The bounded wait duration in milliseconds.',
        type: 'number',
        required: true,
        examples: [1000],
        aliases: [],
        constraints: { minimum: 0, maximum: 300000 },
      },
    ],
    outputs: [],
    human: {
      signature,
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'timeout', input: 'timeout' }],
      groupId: 'navigation',
    },
    agent: {
      summary: 'Wait for a bounded interval.',
      usageGuidance: 'Use when a deterministic browser wait is required.',
      examples: [{ intent: 'Wait briefly', inputs: { timeout: 1000 } }],
    },
    execution: {
      kind: 'operation',
      handlerId: 'browser.waits.timeout',
      handlerVersion: '1',
      runtime: 'browser',
    },
    lifecycle: {},
  }
}

function compositionDefinition(id: string, child: StepDefinition): StepDefinition {
  const composed = definition(id, `I compose ${child.identity.id} {timeout}`)
  composed.execution = {
    kind: 'composition',
    steps: [
      {
        step: {
          ...child.identity,
          definitionHash: computeStepReferenceHash({
            ...child,
            identity: { ...child.identity, status: 'ready' },
            provenance: { ...child.provenance, reviewedBy: 'local-human-ui' },
          }),
        },
        inputs: { timeout: { input: 'timeout' } },
      },
    ],
  }
  return composed
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-registry-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  registry = new StepDefinitionRegistryService(prisma)
})

async function persistedAgentEvidence(searchedAt = new Date().toISOString()) {
  const evidence = createReadySearchEvidence({
    indexHash: readyStepDefinitionSearchIndexHash(await registry.listAllReady()),
    searchedAt,
    correlationId: 'agent-e2e',
    candidateReferences: [],
  })
  const receipt = await prisma.stepDefinitionSearchReceipt.create({
    data: {
      indexHash: evidence.indexHash,
      candidateReferencesJson: JSON.stringify(evidence.candidateReferences),
      correlationId: evidence.correlationId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  })
  return { ...evidence, receiptId: receipt.id }
}

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('StepDefinitionRegistryService', () => {
  it('lists ready definitions with a bounded query and deletes only the expected draft revision', async () => {
    const disposable = await registry.createDraft(definition('browser.disposable.step', 'I discard {timeout}'))
    await registry.deleteDraft(disposable.id, disposable.revision)
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: disposable.id } })).resolves.toBeNull()

    const draft = await registry.createDraft(definition())
    await registry.issueHumanReviewReceipt(draft.id, draft.revision)
    await registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run-list' })

    await expect(registry.listAllReady()).resolves.toHaveLength(1)
  })

  it('persists incomplete authoring work as a non-executable draft with blockers', async () => {
    const draft = await registry.createDraft({
      schemaVersion: '1',
      identity: { id: 'browser.custom.incomplete', version: '1', status: 'draft' },
      provenance: {
        creationMethod: 'human-form',
        createdBy: 'author@example.test',
        createdAt: '2026-07-22T00:00:00.000Z',
      },
      intent: { title: 'Incomplete step' },
    })

    await expect(registry.validateDraft(draft.id)).resolves.toMatchObject({ valid: false })
    await expect(registry.issueHumanReviewReceipt(draft.id, draft.revision)).rejects.toMatchObject({
      code: 'validation_failed',
    })
    await expect(prisma.stepDefinition.count()).resolves.toBe(0)
  })

  it('registers built-in source through the same publication service idempotently', async () => {
    const builtIn = builtInStepDefinitions[0]!
    const first = await registry.registerBuiltIn(builtIn, 'source-conformance')
    const replay = await registry.registerBuiltIn(builtIn, 'ignored-on-replay')

    expect(replay).toEqual(first)
    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
  })

  it('does not let interactive versioning replace a source-owned Step Definition', async () => {
    const builtIn = builtInStepDefinitions[0]!
    await registry.registerBuiltIn(builtIn, 'source-conformance')

    await expect(
      registry.createVersionDraft({
        stepId: builtIn.identity.id,
        version: builtIn.identity.version,
        newVersion: '2',
        createdBy: 'author@example.test',
      }),
    ).rejects.toMatchObject({ code: 'immutable_definition' })
  })

  it('publishes the exact reviewed draft atomically with one identity and receipt', async () => {
    const draft = await registry.createDraft(definition())
    const preview = await registry.previewDraft(draft.id)
    await registry.issueHumanReviewReceipt(draft.id, draft.revision)

    const receipt = await registry.publishDraft({
      draftId: draft.id,
      expectedRevision: draft.revision,
      conformanceRunId: 'conformance-1',
    })

    expect(receipt.step).toEqual({ id: 'browser.navigation.open', version: '1' })
    expect(preview.draftHash).toBe(draft.draftHash)
    expect(receipt.definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
    await expect(registry.read('browser.navigation.open', '1')).resolves.toMatchObject({
      status: 'ready',
      humanProjection: { signature: 'I wait for {timeout} milliseconds' },
      executionBinding: { kind: 'operation' },
      publicationReceipt: { reviewAuthority: 'local-human-ui' },
    })
  })

  it('publishes a composition only after its exact ready dependency closure validates', async () => {
    const child = definition('browser.composition.child', 'I run child {timeout}')
    const childDraft = await registry.createDraft(child)
    await registry.issueHumanReviewReceipt(childDraft.id, childDraft.revision)
    await registry.publishDraft({
      draftId: childDraft.id,
      expectedRevision: childDraft.revision,
      conformanceRunId: 'child',
    })

    const parentDraft = await registry.createDraft(compositionDefinition('browser.composition.parent', child))
    await registry.issueHumanReviewReceipt(parentDraft.id, parentDraft.revision)
    await expect(
      registry.publishDraft({
        draftId: parentDraft.id,
        expectedRevision: parentDraft.revision,
        conformanceRunId: 'parent',
      }),
    ).resolves.toMatchObject({ step: { id: 'browser.composition.parent', version: '1' } })
  })

  it('rejects a composition when the persisted ready child does not match the referenced definition hash', async () => {
    const child = definition('browser.composition.hash-child', 'I run child {timeout}')
    const childDraft = await registry.createDraft(child)
    await registry.issueHumanReviewReceipt(childDraft.id, childDraft.revision)
    await registry.publishDraft({
      draftId: childDraft.id,
      expectedRevision: childDraft.revision,
      conformanceRunId: 'child',
    })

    const parent = compositionDefinition('browser.composition.hash-parent', child)
    if (parent.execution.kind === 'composition')
      parent.execution.steps[0]!.step.definitionHash = `sha256:${'f'.repeat(64)}`
    const parentDraft = await registry.createDraft(parent)
    await registry.issueHumanReviewReceipt(parentDraft.id, parentDraft.revision)
    await expect(
      registry.publishDraft({
        draftId: parentDraft.id,
        expectedRevision: parentDraft.revision,
        conformanceRunId: 'parent',
      }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: {
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'composition.child.hash-mismatch' })]),
      },
    })
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: parentDraft.id } })).resolves.not.toBeNull()
  })

  it('uses persisted dependency status and preserves the reviewed draft when composition publication fails', async () => {
    const child = definition('browser.composition.deprecated', 'I run deprecated child {timeout}')
    const childDraft = await registry.createDraft(child)
    await registry.issueHumanReviewReceipt(childDraft.id, childDraft.revision)
    await registry.publishDraft({
      draftId: childDraft.id,
      expectedRevision: childDraft.revision,
      conformanceRunId: 'child',
    })
    const middleDraft = await registry.createDraft(compositionDefinition('browser.composition.middle', child))
    await registry.issueHumanReviewReceipt(middleDraft.id, middleDraft.revision)
    await registry.publishDraft({
      draftId: middleDraft.id,
      expectedRevision: middleDraft.revision,
      conformanceRunId: 'middle',
    })
    await registry.deprecateFromHumanUi({
      stepId: child.identity.id,
      version: child.identity.version,
      reason: 'No new composition references.',
    })

    const middle = compositionDefinition('browser.composition.middle', child)
    const blocked = compositionDefinition('browser.composition.blocked', middle)
    const persistedMiddle = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: middle.identity.id, version: middle.identity.version } },
      select: { definitionJson: true },
    })
    if (blocked.execution.kind === 'composition')
      blocked.execution.steps[0]!.step.definitionHash = computeStepReferenceHash(
        JSON.parse(persistedMiddle.definitionJson),
      )
    const parentDraft = await registry.createDraft(blocked)
    await registry.issueHumanReviewReceipt(parentDraft.id, parentDraft.revision)
    await expect(
      registry.publishDraft({
        draftId: parentDraft.id,
        expectedRevision: parentDraft.revision,
        conformanceRunId: 'parent',
      }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: { diagnostics: [expect.objectContaining({ code: 'composition.child.not-ready' })] },
    })

    await expect(prisma.stepDefinition.count()).resolves.toBe(2)
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: parentDraft.id } })).resolves.not.toBeNull()
  })

  it('preserves reviewed drafts when a composition references a missing exact child version or itself', async () => {
    const child = definition('browser.composition.exact-child', 'I run exact child {timeout}')
    const childDraft = await registry.createDraft(child)
    await registry.issueHumanReviewReceipt(childDraft.id, childDraft.revision)
    await registry.publishDraft({
      draftId: childDraft.id,
      expectedRevision: childDraft.revision,
      conformanceRunId: 'child',
    })

    const missingVersion = compositionDefinition('browser.composition.missing-version', child)
    if (missingVersion.execution.kind === 'composition') missingVersion.execution.steps[0]!.step.version = '2'
    const missingVersionDraft = await registry.createDraft(missingVersion)
    await registry.issueHumanReviewReceipt(missingVersionDraft.id, missingVersionDraft.revision)
    await expect(
      registry.publishDraft({
        draftId: missingVersionDraft.id,
        expectedRevision: missingVersionDraft.revision,
        conformanceRunId: 'missing-version',
      }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: { diagnostics: [expect.objectContaining({ code: 'composition.child.missing' })] },
    })

    const self = definition('browser.composition.self', 'I run self {timeout}')
    self.execution = {
      kind: 'composition',
      steps: [
        {
          step: { ...self.identity, definitionHash: `sha256:${'f'.repeat(64)}` },
          inputs: { timeout: { input: 'timeout' } },
        },
      ],
    }
    const selfDraft = await registry.createDraft(self)
    await registry.issueHumanReviewReceipt(selfDraft.id, selfDraft.revision)
    await expect(
      registry.publishDraft({ draftId: selfDraft.id, expectedRevision: selfDraft.revision, conformanceRunId: 'self' }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: { diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'composition.cycle' })]) },
    })

    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(
      prisma.stepDefinitionDraft.findUnique({ where: { id: missingVersionDraft.id } }),
    ).resolves.not.toBeNull()
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: selfDraft.id } })).resolves.not.toBeNull()
  })

  it('invalidates review and rejects a stale revision after any draft change', async () => {
    const draft = await registry.createDraft(definition())
    await registry.issueHumanReviewReceipt(draft.id, draft.revision)
    const changed = definition()
    changed.intent.description = 'Changed after review.'
    await registry.updateDraft(draft.id, draft.revision, changed)

    await expect(
      registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run' }),
    ).rejects.toMatchObject({ code: 'stale_revision' })
  })

  it('rejects a replayed or tampered review receipt before publication', async () => {
    const draft = await registry.createDraft(definition('browser.receipt.tamper'))
    await registry.issueHumanReviewReceipt(draft.id, draft.revision)
    await prisma.stepDefinitionDraft.update({
      where: { id: draft.id },
      data: { reviewReceiptHash: `sha256:${'f'.repeat(64)}` },
    })

    await expect(registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision })).rejects.toMatchObject({
      code: 'review_stale',
    })
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: draft.id } })).resolves.not.toBeNull()
  })

  it('requires a registered browser handler with its canonical input/output contract before publication', async () => {
    const unsupported = definition('browser.handler.unsupported')
    if (unsupported.execution.kind === 'operation') unsupported.execution.handlerId = 'browser.not.registered'
    const unsupportedDraft = await registry.createDraft(unsupported)
    await registry.issueHumanReviewReceipt(unsupportedDraft.id, unsupportedDraft.revision)
    await expect(
      registry.publishDraft({ draftId: unsupportedDraft.id, expectedRevision: unsupportedDraft.revision }),
    ).rejects.toMatchObject({ code: 'validation_failed' })

    const mismatched = definition('browser.handler.contract-mismatch')
    mismatched.inputs[0] = {
      ...mismatched.inputs[0]!,
      name: 'url',
      label: 'URL',
      description: 'An incompatible input.',
      type: 'string',
      examples: ['https://example.test'],
      constraints: undefined,
    }
    mismatched.human.signature = 'I wait for {url}'
    mismatched.human.parameterBindings = [{ placeholder: 'url', input: 'url' }]
    mismatched.agent.examples = [{ intent: 'Use incompatible input', inputs: { url: 'https://example.test' } }]
    const mismatchDraft = await registry.createDraft(mismatched)
    await registry.issueHumanReviewReceipt(mismatchDraft.id, mismatchDraft.revision)
    await expect(
      registry.publishDraft({ draftId: mismatchDraft.id, expectedRevision: mismatchDraft.revision }),
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('rolls publication back when a human signature conflicts', async () => {
    const first = await registry.createDraft(definition())
    await registry.issueHumanReviewReceipt(first.id, first.revision)
    await registry.publishDraft({ draftId: first.id, expectedRevision: first.revision, conformanceRunId: 'run-1' })

    const second = await registry.createDraft(definition('browser.navigation.open-other'))
    await registry.issueHumanReviewReceipt(second.id, second.revision)
    await expect(
      registry.publishDraft({ draftId: second.id, expectedRevision: second.revision, conformanceRunId: 'run-2' }),
    ).rejects.toThrow()

    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: second.id } })).resolves.not.toBeNull()
  })

  it('deprecates without rewriting the immutable ready definition or receipt', async () => {
    const draft = await registry.createDraft(definition())
    await registry.issueHumanReviewReceipt(draft.id, draft.revision)
    await registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run-1' })
    const before = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: 'browser.navigation.open', version: '1' } },
      include: { publicationReceipt: true },
    })

    await registry.deprecateFromHumanUi({
      stepId: 'browser.navigation.open',
      version: '1',
      reason: 'Use the replacement.',
    })

    const after = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: 'browser.navigation.open', version: '1' } },
      include: { publicationReceipt: true, deprecation: true },
    })
    expect(after.status).toBe('deprecated')
    expect(after.definitionJson).toBe(before.definitionJson)
    expect(after.publicationReceipt?.receiptHash).toBe(before.publicationReceipt?.receiptHash)
    expect(after.deprecation).toMatchObject({ reason: 'Use the replacement.', actor: 'local-human-ui' })
  })

  it('publishes an agent-authored draft through the same review gate and returns one searchable identity', async () => {
    const authored = definition('custom.agent.archive', 'I archive {timeout}')
    authored.provenance.creationMethod = 'agent-command'
    authored.intent.searchTerms = ['retention-policy']
    const draft = await registry.createDraft(authored, undefined, {
      reuseEvidence: {
        ...(await persistedAgentEvidence()),
        reuseJustification: 'No ready definition covers the retention-policy behavior.',
      },
    })
    await expect(
      prisma.stepDefinitionTelemetryEvent.findFirst({
        where: { outcome: 'selection_selected', correlationId: 'agent-e2e' },
      }),
    ).resolves.toMatchObject({ surface: 'agent', planId: null })

    await registry.issueHumanReviewReceipt(draft.id, draft.revision)
    await registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'agent-e2e' })

    const matches = (await registry.listAllReady()).filter(item => item.id === 'custom.agent.archive')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ id: 'custom.agent.archive', version: '1', status: 'ready' })
  })

  it('rejects agent drafts without fresh structured ready-registry search evidence', async () => {
    const authored = definition('custom.agent.evidence', 'I retain {timeout}')
    authored.provenance.creationMethod = 'agent-command'
    await expect(registry.createDraft(authored)).rejects.toMatchObject({ name: 'ZodError' })
    await expect(
      registry.createDraft(authored, undefined, {
        reuseEvidence: {
          ...(await persistedAgentEvidence('2020-01-01T00:00:00.000Z')),
          reuseJustification: 'The ready registry has no matching definition.',
        },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })
})
