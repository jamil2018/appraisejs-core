import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'

import { StepDefinitionRegistryService } from './step-definition-registry-service'

let workspace: string
let prisma: PrismaClient
let registry: StepDefinitionRegistryService

function definition(id = 'browser.navigation.open', signature = 'I navigate to {url}'): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'draft' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'author@example.test',
      createdAt: '2026-07-22T00:00:00.000Z',
    },
    intent: {
      title: 'Open a page',
      description: 'Navigates the active browser page to an explicit URL.',
      capabilities: ['browser.navigation'],
      searchTerms: ['navigate'],
      examples: ['Open account settings.'],
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
      signature,
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'url', input: 'url' }],
      groupId: 'navigation',
    },
    agent: {
      summary: 'Open an absolute URL.',
      usageGuidance: 'Use when the destination is known.',
      examples: [{ intent: 'Open settings', inputs: { url: 'https://example.test/settings' } }],
    },
    execution: {
      kind: 'operation',
      handlerId: 'browser.navigation.open',
      handlerVersion: '1',
      runtime: 'browser',
    },
    lifecycle: {},
  }
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-registry-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  registry = new StepDefinitionRegistryService(prisma)
})

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('StepDefinitionRegistryService', () => {
  it('lists ready definitions with a bounded query and deletes only the expected draft revision', async () => {
    const disposable = await registry.createDraft(definition('browser.disposable.step', 'I discard {url}'))
    await registry.deleteDraft(disposable.id, disposable.revision)
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: disposable.id } })).resolves.toBeNull()

    const draft = await registry.createDraft(definition())
    await registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')
    await registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run-list' })

    await expect(registry.list({ status: 'ready', query: 'navigation', limit: 500 })).resolves.toHaveLength(1)
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
    await expect(registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')).rejects.toMatchObject({
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

  it('publishes the exact reviewed draft atomically with one identity and receipt', async () => {
    const draft = await registry.createDraft(definition())
    const preview = await registry.previewDraft(draft.id)
    await registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')

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
      humanProjection: { signature: 'I navigate to {url}' },
      executionBinding: { kind: 'operation' },
      publicationReceipt: { reviewAuthority: 'reviewer@example.test' },
    })
  })

  it('invalidates review and rejects a stale revision after any draft change', async () => {
    const draft = await registry.createDraft(definition())
    await registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')
    const changed = definition()
    changed.intent.description = 'Changed after review.'
    await registry.updateDraft(draft.id, draft.revision, changed)

    await expect(
      registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run' }),
    ).rejects.toMatchObject({ code: 'stale_revision' })
  })

  it('rolls publication back when a human signature conflicts', async () => {
    const first = await registry.createDraft(definition())
    await registry.submitForReview(first.id, first.revision, 'reviewer@example.test')
    await registry.publishDraft({ draftId: first.id, expectedRevision: first.revision, conformanceRunId: 'run-1' })

    const second = await registry.createDraft(definition('browser.navigation.open-other'))
    await registry.submitForReview(second.id, second.revision, 'reviewer@example.test')
    await expect(
      registry.publishDraft({ draftId: second.id, expectedRevision: second.revision, conformanceRunId: 'run-2' }),
    ).rejects.toThrow()

    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(prisma.stepDefinitionDraft.findUnique({ where: { id: second.id } })).resolves.not.toBeNull()
  })

  it('deprecates without rewriting the immutable ready definition or receipt', async () => {
    const draft = await registry.createDraft(definition())
    await registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')
    await registry.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId: 'run-1' })
    const before = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: 'browser.navigation.open', version: '1' } },
      include: { publicationReceipt: true },
    })

    await registry.deprecate({
      stepId: 'browser.navigation.open',
      version: '1',
      reason: 'Use the replacement.',
      actor: 'reviewer@example.test',
    })

    const after = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: 'browser.navigation.open', version: '1' } },
      include: { publicationReceipt: true, deprecation: true },
    })
    expect(after.status).toBe('deprecated')
    expect(after.definitionJson).toBe(before.definitionJson)
    expect(after.publicationReceipt?.receiptHash).toBe(before.publicationReceipt?.receiptHash)
    expect(after.deprecation).toMatchObject({ reason: 'Use the replacement.', actor: 'reviewer@example.test' })
  })
})
