import { promises as fs } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'
import { proposeValidationResources } from './validation-resource-proposal-service'

let workspace: string
let client: PrismaClient
let targetProjectId: string

beforeEach(async () => {
  const created = await createPlanRuntimeTestWorkspace('validation-resources-', 'appraise.db')
  workspace = created.workspace
  client = created.client
  const target = await client.targetProject.create({
    data: { canonicalPath: workspace, displayName: 'Target', fingerprint: `sha256:${'d'.repeat(64)}` },
  })
  targetProjectId = target.id
  await client.planProjection.create({
    data: {
      planId: 'plan-resources',
      revision: 1,
      lifecycle: 'preparing_validations',
      goal: 'Resource proposal',
      description: 'Resource proposal',
      sourceHash: `sha256:${'a'.repeat(64)}`,
      planPath: 'plan-resources.yaml',
      lastValidProjectedAt: new Date(),
      targetProjectId: target.id,
    },
  })
  await new PlanArtifactRepository(workspace).create(
    'plan',
    'plan-resources',
    serializeYamlArtifact('plan', {
      version: '1',
      planId: 'plan-resources',
      revision: 1,
      lifecycle: 'preparing_validations',
      goal: 'Resource proposal',
      description: 'Resource proposal',
      tasks: [],
      edges: [],
      implementationGroups: [],
    }),
  )
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

const proposal = () => ({
  schemaVersion: 1,
  idempotencyKey: 'todo-page-resources',
  modules: [{ localKey: 'todo', name: 'Todo' }],
  locatorGroups: [{ localKey: 'todo-page', name: 'Todo page', moduleKey: 'todo', route: '/' }],
  locators: [
    { localKey: 'todo-input', name: 'Todo input', groupKey: 'todo-page', selector: '[data-testid="todo-input"]' },
  ],
  environments: [{ localKey: 'local', name: `Local ${Date.now()}`, baseUrl: 'http://localhost:3000' }],
  templateSteps: [],
})

describe('validation resource proposals', () => {
  it('creates a target-bound graph transactionally and replays by content-bound key', async () => {
    const first = await proposeValidationResources(
      { planId: 'plan-resources', proposal: proposal(), projectDirectory: workspace },
      client,
    )
    expect(first).toMatchObject({ replayed: false, contextHash: expect.stringMatching(/^sha256:/) })
    expect(first.ids.environments.local).toMatch(/^apr-/)
    expect(first.bindings.locators[0]).toMatchObject({
      id: first.ids.locators['todo-input'],
      astRef: `locator_${first.ids.locators['todo-input']}`,
      version: '1',
      targetProjectId,
      moduleId: first.ids.modules.todo,
      locatorGroupId: first.ids.locatorGroups['todo-page'],
    })
    const storedProposal = JSON.parse(
      (await client.validationResourceProposal.findFirstOrThrow({ where: { planId: 'plan-resources' } })).proposalJson,
    )
    const replay = await proposeValidationResources(
      { planId: 'plan-resources', proposal: storedProposal, projectDirectory: workspace },
      client,
    )
    expect(replay).toMatchObject({ replayed: true, proposalHash: first.proposalHash })
    await expect(client.module.findUnique({ where: { id: first.ids.modules.todo } })).resolves.toMatchObject({
      targetProjectId,
    })
    await expect(
      client.locatorGroup.findUnique({ where: { id: first.ids.locatorGroups['todo-page'] } }),
    ).resolves.toMatchObject({
      targetProjectId,
    })
    await expect(client.locator.findUnique({ where: { id: first.ids.locators['todo-input'] } })).resolves.toMatchObject(
      {
        targetProjectId,
      },
    )
    await expect(client.environment.findUnique({ where: { id: first.ids.environments.local } })).resolves.toMatchObject(
      {
        targetProjectId,
      },
    )
  })

  it('rejects unresolved graphs before any database write', async () => {
    const invalid = proposal()
    invalid.locators[0]!.groupKey = 'missing-group'
    await expect(
      proposeValidationResources({ planId: 'plan-resources', proposal: invalid, projectDirectory: workspace }, client),
    ).rejects.toBeTruthy()
    await expect(client.validationResourceProposal.count()).resolves.toBe(0)
  })

  it('rejects proposals outside validation preparation', async () => {
    await client.planProjection.update({ where: { planId: 'plan-resources' }, data: { lifecycle: 'implementing' } })
    await expect(
      proposeValidationResources(
        { planId: 'plan-resources', proposal: proposal(), projectDirectory: workspace },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('allows an agent-suggested template step to reference a shared group', async () => {
    const foreignProject = await client.targetProject.create({
      data: {
        canonicalPath: `${workspace}-foreign`,
        displayName: 'Foreign',
        fingerprint: `sha256:${'e'.repeat(64)}`,
      },
    })
    const foreignGroup = await client.templateStepGroup.create({
      data: { name: 'Foreign actions', targetProjectId: foreignProject.id },
    })
    const input = {
      ...proposal(),
      templateSteps: [
        { localKey: 'foreign-step', name: 'Foreign step', signature: 'Given foreign data', groupId: foreignGroup.id },
      ],
    }

    await expect(
      proposeValidationResources({ planId: 'plan-resources', proposal: input, projectDirectory: workspace }, client),
    ).resolves.toMatchObject({ replayed: false })
    await expect(client.templateStep.count({ where: { id: { startsWith: 'apr-' } } })).resolves.toBe(1)
  })
})
