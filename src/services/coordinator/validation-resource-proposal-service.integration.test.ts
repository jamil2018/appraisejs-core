import { promises as fs } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'
import {
  abandonValidationResourceProposal,
  cleanupValidationResourceProposal,
  proposeValidationResources,
} from './validation-resource-proposal-service'

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
  schemaVersion: 2,
  idempotencyKey: 'todo-page-resources',
  modules: [{ localKey: 'todo', name: 'Todo' }],
  locatorGroups: [{ localKey: 'todo-page', name: 'Todo page', moduleKey: 'todo', route: '/' }],
  locators: [
    { localKey: 'todo-input', name: 'Todo input', groupKey: 'todo-page', selector: '[data-testid="todo-input"]' },
  ],
  environments: [{ localKey: 'local', name: `Local ${Date.now()}`, baseUrl: 'http://localhost:3000' }],
})

describe('validation resource proposals', () => {
  it('creates a target-bound graph transactionally and replays by content-bound key', async () => {
    const first = await proposeValidationResources(
      { planId: 'plan-resources', proposal: proposal(), projectDirectory: workspace },
      client,
    )
    expect(first).toMatchObject({ replayed: false, contextHash: expect.stringMatching(/^sha256:/) })
    expect(first.ids.environments.local).toMatch(/^apr-/)
    expect(first.bindings.environments[0]).toMatchObject({
      localKey: 'local',
      id: first.ids.environments.local,
      reference: first.ids.environments.local,
    })
    expect(first.bindings.locators[0]).toMatchObject({
      localKey: 'todo-input',
      id: first.ids.locators['todo-input'],
      astRef: `locator_${first.ids.locators['todo-input']}`,
      version: '1',
      targetProjectId,
      moduleId: first.ids.modules.todo,
      locatorGroupId: first.ids.locatorGroups['todo-page'],
    })
    expect(first.bindings.locatorGroups[0]).toMatchObject({ localKey: 'todo-page' })
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

  it('allows different target projects to use the same environment name', async () => {
    const input = proposal()
    input.environments[0]!.name = 'Local'
    const foreignProject = await client.targetProject.create({
      data: {
        canonicalPath: `${workspace}-foreign-environment`,
        displayName: 'Foreign environment project',
        fingerprint: `sha256:${'f'.repeat(64)}`,
      },
    })
    await client.environment.create({
      data: { name: 'Local', baseUrl: 'http://localhost:4000', targetProjectId: foreignProject.id },
    })

    const result = await proposeValidationResources(
      { planId: 'plan-resources', proposal: input, projectDirectory: workspace },
      client,
    )

    await expect(
      client.environment.findUnique({ where: { id: result.ids.environments.local } }),
    ).resolves.toMatchObject({ name: 'Local', targetProjectId })
    await expect(client.environment.count({ where: { name: 'Local' } })).resolves.toBe(2)
  })

  it('reuses a compatible same-project graph proposed under different local keys', async () => {
    const initial = proposal()
    const first = await proposeValidationResources(
      { planId: 'plan-resources', proposal: initial, projectDirectory: workspace },
      client,
    )
    const compatible = structuredClone(initial)
    compatible.idempotencyKey = 'todo-page-resources-compatible'
    compatible.modules[0]!.localKey = 'todo-v2'
    compatible.locatorGroups[0]!.localKey = 'todo-page-v2'
    compatible.locatorGroups[0]!.moduleKey = 'todo-v2'
    compatible.locators[0]!.localKey = 'todo-input-v2'
    compatible.locators[0]!.groupKey = 'todo-page-v2'
    compatible.environments[0]!.localKey = 'local-v2'

    const reused = await proposeValidationResources(
      { planId: 'plan-resources', proposal: compatible, projectDirectory: workspace },
      client,
    )

    expect(reused.ids.modules['todo-v2']).toBe(first.ids.modules.todo)
    expect(reused.ids.locatorGroups['todo-page-v2']).toBe(first.ids.locatorGroups['todo-page'])
    expect(reused.ids.locators['todo-input-v2']).toBe(first.ids.locators['todo-input'])
    expect(reused.ids.environments['local-v2']).toBe(first.ids.environments.local)
  })

  it('abandons and safely cleans proposal-owned resources without deleting reused resources', async () => {
    const first = await proposeValidationResources(
      { planId: 'plan-resources', proposal: proposal(), projectDirectory: workspace },
      client,
    )
    await expect(
      abandonValidationResourceProposal(
        { planId: 'plan-resources', idempotencyKey: 'todo-page-resources', reason: 'Diagnostic proposal' },
        client,
      ),
    ).resolves.toMatchObject({ status: 'abandoned', abandonReason: 'Diagnostic proposal' })

    const cleaned = await cleanupValidationResourceProposal(
      { planId: 'plan-resources', idempotencyKey: 'todo-page-resources' },
      client,
    )
    expect(cleaned).toMatchObject({ status: 'cleaned', retained: [] })
    await expect(client.module.findUnique({ where: { id: first.ids.modules.todo } })).resolves.toBeNull()
    await expect(client.locator.findUnique({ where: { id: first.ids.locators['todo-input'] } })).resolves.toBeNull()
    await expect(
      cleanupValidationResourceProposal({ planId: 'plan-resources', idempotencyKey: 'todo-page-resources' }, client),
    ).resolves.toMatchObject({ status: 'cleaned' })
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

  it('rejects legacy Template Step authoring before any database write', async () => {
    const input = { ...proposal(), templateSteps: [] }

    await expect(
      proposeValidationResources({ planId: 'plan-resources', proposal: input, projectDirectory: workspace }, client),
    ).rejects.toBeTruthy()
    await expect(client.validationResourceProposal.count()).resolves.toBe(0)
  })
})
