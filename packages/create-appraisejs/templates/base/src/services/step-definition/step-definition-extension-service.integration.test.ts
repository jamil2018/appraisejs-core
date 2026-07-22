import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { StepDefinitionRegistryService } from './step-definition-registry-service'
import {
  generateStepDefinitionContract,
  generateStepDefinitionHandlerBoilerplate,
  StepDefinitionExtensionService,
} from './step-definition-extension-service'
import type { StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

let workspace: string
let prisma: PrismaClient
let registry: StepDefinitionRegistryService
let extensions: StepDefinitionExtensionService

function definition(): StepDefinition {
  return {
    schemaVersion: '1',
    identity: { id: 'custom.account.greet', version: '1', status: 'draft' },
    provenance: { creationMethod: 'human-form', createdBy: 'local-user', createdAt: '2026-07-22T00:00:00.000Z' },
    intent: {
      title: 'Greet an account',
      description: 'Creates a deterministic greeting for an account.',
      capabilities: ['node'],
      searchTerms: ['greet'],
      examples: ['Greet account Ada.'],
    },
    inputs: [
      {
        name: 'name',
        label: 'Name',
        description: 'Account display name.',
        type: 'string',
        required: true,
        examples: ['Ada'],
        aliases: [],
      },
    ],
    outputs: [{ name: 'message', description: 'Greeting text.', type: 'string', storable: true }],
    human: {
      signature: 'I greet account {name}',
      keywordCompatibility: ['When'],
      parameterBindings: [{ placeholder: 'name', input: 'name' }],
      groupId: 'accounts',
    },
    agent: {
      summary: 'Greet an account.',
      usageGuidance: 'Use for deterministic greeting checks.',
      examples: [{ intent: 'Greet Ada', inputs: { name: 'Ada' } }],
    },
    execution: {
      kind: 'reviewed-extension',
      extensionId: 'custom.account.greet',
      extensionVersion: '1',
      exportName: 'handler',
      sourceHash: `sha256:${'0'.repeat(64)}`,
      compiledHash: `sha256:${'0'.repeat(64)}`,
      runtime: 'node',
    },
    lifecycle: {},
  }
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-extension-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  registry = new StepDefinitionRegistryService(prisma)
  extensions = new StepDefinitionExtensionService(prisma)
})

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('StepDefinitionExtensionService', () => {
  it('generates deterministic contracts without replacing user source', () => {
    expect(generateStepDefinitionContract(definition())).toContain('readonly name: string')
    expect(generateStepDefinitionHandlerBoilerplate(definition())).toContain('Implement the reviewed behavior here.')
  })

  it('rejects undeclared imports and forbidden globals', async () => {
    const draft = await registry.createDraft(definition())
    await extensions.saveDraftArtifact(draft.id, draft.revision, {
      handlerSource: "import fs from 'node:fs'\nexport const handler = async () => process.cwd()",
      examples: [{ name: 'Ada', inputs: { name: 'Ada' } }],
    })

    const result = await extensions.compileDraftArtifact(draft.id, draft.revision)
    expect(result.conformance.passed).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        'Import "node:fs" is not allowed by the declared runtime.',
        'Global "process" is not allowed.',
      ]),
    )
  })

  it('binds compiled hashes, exact review, publication, and immutable reviewed bytes', async () => {
    const draft = await registry.createDraft(definition())
    const source =
      "import type { StepHandler } from './contract.js'\nexport const handler: StepHandler = async ({ name }) => ({ message: `Hello ${name}` })"
    await extensions.saveDraftArtifact(draft.id, draft.revision, {
      handlerSource: source,
      examples: [{ name: 'Ada', inputs: { name: 'Ada' } }],
    })
    const compiled = await extensions.compileDraftArtifact(draft.id, draft.revision)
    expect(compiled.conformance.passed).toBe(true)

    await registry.submitForReview(draft.id, compiled.revision, 'local-user')
    await registry.publishDraft({
      draftId: draft.id,
      expectedRevision: compiled.revision,
      conformanceRunId: 'compile-1',
    })

    await expect(
      prisma.stepReviewedExtension.findUniqueOrThrow({
        where: { id_version: { id: 'custom.account.greet', version: '1' } },
      }),
    ).resolves.toMatchObject({ source, sourceHash: expect.stringMatching(/^sha256:/), reviewedBy: 'local-user' })
  })
})
