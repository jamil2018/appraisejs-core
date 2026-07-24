import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  computeStepReferenceHash,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { StepDefinitionRegistryService } from './step-definition-registry-service'
import { StepBlockMigrationService } from './step-block-migration-service'

let workspace: string
let prisma: PrismaClient
let registry: StepDefinitionRegistryService
let migration: StepBlockMigrationService

function childDefinition(id: string): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id, version: '1', status: 'draft' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'migration-test',
      createdAt: '2026-07-25T00:00:00.000Z',
    },
    intent: {
      title: 'Child step',
      description: 'Provides a stable child contract.',
      capabilities: ['browser.navigation'],
      searchTerms: ['child'],
      examples: ['Use the child step.'],
    },
    inputs: [
      {
        name: 'url',
        label: 'URL',
        description: 'Target URL.',
        type: 'string',
        required: true,
        examples: ['https://example.test'],
        aliases: [],
      },
    ],
    outputs: [],
    human: {
      signature: 'I use child {url}',
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'url', input: 'url' }],
      groupId: 'migration-test',
    },
    agent: {
      summary: 'Use the child step.',
      usageGuidance: 'Use with an explicit URL.',
      examples: [{ intent: 'Use child', inputs: { url: 'https://example.test' } }],
    },
    execution: { kind: 'operation', handlerId: id, handlerVersion: '1', runtime: 'browser' },
    lifecycle: {},
  }
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-block-migration-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  registry = new StepDefinitionRegistryService(prisma)
  migration = new StepBlockMigrationService(prisma)
})

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

async function seedReadyChild(templateStepId = 'template-child') {
  const child = childDefinition('browser.migration.child')
  const draft = await registry.createDraft(child)
  await registry.submitForReview(draft.id, draft.revision, 'reviewer@example.test')
  await registry.publishDraft({
    draftId: draft.id,
    expectedRevision: draft.revision,
    conformanceRunId: 'migration-child',
  })
  const ready = await registry.read(child.identity.id, child.identity.version)
  const group = await prisma.templateStepGroup.create({ data: { name: `Migration ${templateStepId}` } })
  await prisma.templateStep.create({
    data: {
      id: templateStepId,
      name: 'Legacy child',
      signature: 'I use child {url}',
      type: 'ACTION',
      icon: 'NAVIGATION',
      templateStepGroupId: group.id,
      operationId: ready.id,
      operationVersion: ready.version,
      operationMigrationState: 'mapped',
    },
  })
  await prisma.stepCompatibilityReference.create({
    data: {
      legacyKind: 'template-step-id',
      legacyValue: templateStepId,
      stepId: ready.id,
      stepVersion: ready.version,
    },
  })
  const persisted = await prisma.stepDefinition.findUniqueOrThrow({
    where: { id_version: { id: ready.id, version: ready.version } },
    select: { definitionJson: true },
  })
  return { ...ready, referenceHash: computeStepReferenceHash(JSON.parse(persisted.definitionJson)) }
}

async function seedBlock(templateStepId: string, parameterMap = '{"url":"url"}') {
  return prisma.stepBlock.create({
    data: {
      name: 'Preserve login journey',
      description: 'Preserved source wording.',
      intent: 'Preserved source intent.',
      steps: { create: { templateStepId, order: 0, parameterMap } },
    },
    include: { steps: true },
  })
}

describe('StepBlockMigrationService', () => {
  it('returns a stable empty dry-run without writing ledger state', async () => {
    await expect(migration.preview()).resolves.toEqual([])
    await expect(prisma.stepBlockMigrationLedger.count()).resolves.toBe(0)
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
  })

  it('keeps dry-run write-free and applies one ordered exact-reference draft idempotently', async () => {
    const ready = await seedReadyChild()
    const block = await seedBlock('template-child')

    const firstPreview = await migration.preview()
    const secondPreview = await migration.preview()
    expect(secondPreview).toEqual(firstPreview)
    expect(firstPreview).toMatchObject([
      {
        sourceStepBlockId: block.id,
        classification: 'convertible-draft',
        status: 'global-review-required',
        proposedDraft: { version: '1' },
      },
    ])
    await expect(prisma.stepBlockMigrationLedger.count()).resolves.toBe(0)
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)

    const applied = await migration.applyDrafts()
    const replay = await migration.applyDrafts()
    expect(replay).toEqual(applied)
    await expect(prisma.stepBlockMigrationLedger.count()).resolves.toBe(1)
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(1)
    const ledger = await prisma.stepBlockMigrationLedger.findUniqueOrThrow({ where: { sourceStepBlockId: block.id } })
    const draft = await prisma.stepDefinitionDraft.findUniqueOrThrow({ where: { id: ledger.draftId! } })
    const definition = JSON.parse(draft.draftJson)
    expect(JSON.parse(ledger.snapshotJson)).toMatchObject({
      source: { name: block.name, description: block.description, intent: block.intent },
      steps: [{ order: 0, templateStepId: 'template-child' }],
    })
    expect(definition.execution).toEqual({
      kind: 'composition',
      steps: [
        {
          step: {
            id: ready.id,
            version: ready.version,
            definitionHash: ready.referenceHash,
          },
          inputs: { url: { input: 'url' } },
        },
      ],
    })
    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(prisma.stepCompatibilityReference.count()).resolves.toBe(1)
    await expect(prisma.stepBlock.findUniqueOrThrow({ where: { id: block.id } })).resolves.toMatchObject({
      name: 'Preserve login journey',
      description: 'Preserved source wording.',
      intent: 'Preserved source intent.',
    })

    await registry.deleteDraft(draft.id, draft.revision)
    await expect(
      prisma.stepBlockMigrationLedger.findUniqueOrThrow({ where: { sourceStepBlockId: block.id } }),
    ).resolves.toMatchObject({ draftId: null })
  })

  it('quarantines stable malformed, custom, and stale legacy classifications without ready or legacy mutation', async () => {
    await seedReadyChild('template-valid')
    const invalid = await seedBlock('template-valid', '{bad json')
    const customGroup = await prisma.templateStepGroup.create({ data: { name: 'Custom children' } })
    await prisma.templateStep.create({
      data: {
        id: 'template-custom',
        name: 'Custom child',
        signature: 'I run custom',
        type: 'ACTION',
        icon: 'DEBUG',
        templateStepGroupId: customGroup.id,
        functionDefinition: 'return true',
        operationMigrationState: 'manual-only-custom',
      },
    })
    const custom = await seedBlock('template-custom', '{}')
    const staleGroup = await prisma.templateStepGroup.create({ data: { name: 'Stale children' } })
    await prisma.templateStep.create({
      data: {
        id: 'template-stale',
        name: 'Stale child',
        signature: 'I run stale',
        type: 'ACTION',
        icon: 'DEBUG',
        templateStepGroupId: staleGroup.id,
      },
    })
    const stale = await seedBlock('template-stale', '{}')

    const applied = await migration.applyDrafts()
    expect(applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: invalid.id, classification: 'invalid-parameter-map' }),
        expect.objectContaining({ sourceStepBlockId: custom.id, classification: 'incomplete-custom-child' }),
        expect.objectContaining({ sourceStepBlockId: stale.id, classification: 'stale-legacy-proof' }),
      ]),
    )
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
    await expect(prisma.stepDefinition.count()).resolves.toBe(1)
    await expect(prisma.stepBlock.count()).resolves.toBe(3)
    const customLedger = await prisma.stepBlockMigrationLedger.findUniqueOrThrow({
      where: { sourceStepBlockId: custom.id },
    })
    expect(customLedger.snapshotJson).not.toContain('return true')
    expect(JSON.parse(customLedger.snapshotJson)).toMatchObject({
      steps: [
        {
          templateMapping: {
            hasFunctionDefinition: true,
            functionDefinitionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          },
        },
      ],
    })
  })

  it('records source drift and never overwrites a reviewed or user-edited migration draft', async () => {
    await seedReadyChild()
    const block = await seedBlock('template-child')
    const [applied] = await migration.applyDrafts()
    const draft = await registry.readDraft(applied.draftId!)
    await registry.updateDraft(applied.draftId!, draft.revision, {
      ...draft.definition,
      intent: { ...(draft.definition as { intent: { title: string } }).intent, title: 'User-edited title' },
    })
    await prisma.stepBlock.update({ where: { id: block.id }, data: { description: 'Changed legacy wording.' } })

    await expect(migration.preview()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'source-drift' }),
      ]),
    )
    await migration.applyDrafts()
    const ledger = await prisma.stepBlockMigrationLedger.findUniqueOrThrow({ where: { sourceStepBlockId: block.id } })
    const after = await registry.readDraft(applied.draftId!)
    expect(ledger).toMatchObject({ classification: 'source-drift', status: 'source-drift', draftId: applied.draftId })
    expect(after).toMatchObject({ revision: 2, definition: { intent: { title: 'User-edited title' } } })
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(1)
    await expect(migration.preview()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'source-drift' }),
      ]),
    )
  })

  it('quarantines a disagreement between legacy mapping and exact compatibility identity', async () => {
    await seedReadyChild()
    const block = await seedBlock('template-child')
    await prisma.templateStep.update({
      where: { id: 'template-child' },
      data: { operationId: 'browser.conflicting.identity' },
    })

    await expect(migration.applyDrafts()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'identity-conflict' }),
      ]),
    )
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
  })

  it('quarantines compatibility proof drift instead of replaying a stale convertible result', async () => {
    await seedReadyChild()
    const block = await seedBlock('template-child')
    await migration.applyDrafts()
    await prisma.stepCompatibilityReference.delete({
      where: { legacyKind_legacyValue: { legacyKind: 'template-step-id', legacyValue: 'template-child' } },
    })

    await expect(migration.preview()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'source-drift' }),
      ]),
    )
    await expect(migration.applyDrafts()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'source-drift' }),
      ]),
    )
  })

  it('quarantines malformed persisted ready-definition JSON without aborting the migration', async () => {
    const ready = await seedReadyChild()
    const block = await seedBlock('template-child')
    await prisma.stepDefinition.update({
      where: { id_version: { id: ready.id, version: ready.version } },
      data: { definitionJson: '{malformed' },
    })

    await expect(migration.applyDrafts()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'stale-legacy-proof' }),
      ]),
    )
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
  })

  it('quarantines ready-definition execution drift instead of normalizing tampered proof', async () => {
    const ready = await seedReadyChild()
    const block = await seedBlock('template-child')
    const row = await prisma.stepDefinition.findUniqueOrThrow({
      where: { id_version: { id: ready.id, version: ready.version } },
      select: { definitionJson: true },
    })
    const tampered = JSON.parse(row.definitionJson)
    tampered.execution.handlerVersion = '2'
    await prisma.stepDefinition.update({
      where: { id_version: { id: ready.id, version: ready.version } },
      data: { definitionJson: JSON.stringify(tampered) },
    })

    await expect(migration.preview()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'stale-legacy-proof' }),
      ]),
    )
    await expect(migration.applyDrafts()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepBlockId: block.id, classification: 'stale-legacy-proof' }),
      ]),
    )
    await expect(prisma.stepDefinitionDraft.count()).resolves.toBe(0)
  })
})
