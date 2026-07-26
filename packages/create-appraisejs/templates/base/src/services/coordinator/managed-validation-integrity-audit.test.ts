import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { inadequateFreshTargetAuditSubmission } from '@/test/validation-ast-test-fixtures'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  computeStepReferenceHash,
  stepDefinitionContentHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { checkValidationAstForPlan } from './validation-ast-operation-service'
import { readValidationContext } from './validation-authoring-context-service'

const planHash = `sha256:${'a'.repeat(64)}`
let workspace: string

const readyDefinitions = ['browser.navigation.goto', 'browser.waits.page-ready', 'browser.navigation.reload'].map(
  id => {
    const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
    const hashes = computeStepDefinitionHashes(definition)
    const registryManifestHash = computeStepReferenceHash(definition)
    const receipt = {
      step: { id: definition.identity.id, version: definition.identity.version },
      ...hashes,
      registryManifestHash,
      executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, 'test-run'),
      conformanceRunId: 'test-run',
      reviewAuthority: 'test-reviewer',
      publishedAt: '2026-07-25T00:00:00.000Z',
    }
    return {
      status: 'ready',
      id: definition.identity.id,
      version: definition.identity.version,
      definitionJson: canonicalStepDefinitionJson(definition),
      ...hashes,
      publicationReceipt: {
        receiptHash: stepDefinitionContentHash(receipt),
        receiptJson: JSON.stringify(receipt),
      },
    }
  },
)

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'managed-validation-audit-'))
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await new PlanArtifactRepository(workspace).create(
    'plan',
    'plan-a',
    serializeYamlArtifact('plan', {
      version: '1',
      planId: 'plan-a',
      revision: 1,
      lifecycle: 'preparing_validations',
      goal: 'Audit managed validation',
      description: 'Capture fresh-target integrity gaps.',
      tasks: ['task-create', 'task-complete', 'task-filter', 'task-persist', 'task-responsive'].map(id => ({
        id,
        title: id,
        description: id,
        acceptanceCriteria: ['Complete'],
        validationIntent: id,
      })),
      edges: [],
      implementationGroups: [],
    }),
  )
})

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

function auditClient() {
  const project = { id: 'project-a', displayName: 'Project A', canonicalPath: '/tmp/project-a', fingerprint: planHash }
  return {
    planProjection: {
      findUnique: async () => ({
        planId: 'plan-a',
        revision: 1,
        lifecycle: 'preparing_validations',
        sourceHash: planHash,
        targetProjectId: project.id,
        targetProject: project,
        tasks: ['task-create', 'task-complete', 'task-filter', 'task-persist', 'task-responsive'].map(
          (taskId, position) => ({ taskId, position, title: taskId, description: taskId, validationIntent: taskId }),
        ),
      }),
    },
    module: { findMany: async () => [{ id: 'foreign-module', name: 'Foreign', parentId: null }] },
    testSuite: { findMany: async () => [] },
    testCase: { findMany: async () => [] },
    stepDefinition: { findMany: async () => readyDefinitions },
    locatorGroup: { findMany: async () => [] },
    locator: { findMany: async () => [] },
    environment: {
      findMany: async () => [{ id: 'environment-a', name: 'local', baseUrl: 'http://localhost:3000' }],
    },
    projectResourceOwnership: {
      findMany: async () => [
        {
          id: 'ownership-environment-a',
          entityType: 'environment',
          entityId: 'environment-a',
          scope: 'project',
          targetProjectId: project.id,
          origin: 'audit-fixture',
          contentHash: planHash,
          imports: [],
        },
      ],
    },
  } as unknown as PrismaClient
}

describe('managed validation integrity audit fixtures', () => {
  it('does not expose unrelated resources in a fresh target context', async () => {
    const context = await readValidationContext('plan-a', { client: auditClient(), projectDirectory: workspace })
    expect(context.notModified).not.toBe(true)
    if (!context.resources) throw new Error('Expected validation resources.')
    expect(context.resources.modules).toEqual([])
    expect(context.resources.stepDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: expect.objectContaining({ definitionHash: expect.stringMatching(/^sha256:/) }),
        }),
      ]),
    )
  })

  it('accepts the exact stable environment reference returned by context', async () => {
    const context = await readValidationContext('plan-a', { client: auditClient(), projectDirectory: workspace })
    if (!context.resources) throw new Error('Expected validation resources.')
    const environment = context.resources.environments[0] as { reference: string }
    const submission = inadequateFreshTargetAuditSubmission(planHash)
    submission.ast.matrix[0]!.environmentId = environment.reference
    const checked = await checkValidationAstForPlan('plan-a', submission, auditClient())
    expect(checked.blockers).not.toContainEqual(expect.objectContaining({ code: 'environment-not-found' }))
  })

  it('rejects broad task and quality claims without a reviewable coverage argument', async () => {
    const submission = inadequateFreshTargetAuditSubmission(planHash)
    submission.ast.matrix[0]!.environmentId = 'environment-a'
    await expect(checkValidationAstForPlan('plan-a', submission, auditClient())).resolves.toMatchObject({
      valid: false,
    })
  })
})
