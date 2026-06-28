import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serializeYamlArtifact, type PlanArtifact } from '@/lib/plan-contract'
import { ensurePlanProjectionTestSchema } from '@/test/plan-runtime-schema-test-helper'

import { syncPlans } from './plan-sync-service'

let workspace: string
let databasePath: string
let client: PrismaClient

function plan(planId: string, revision = 1): PlanArtifact {
  return {
    version: '1',
    planId,
    revision,
    lifecycle: 'draft',
    goal: `Deliver ${planId}`,
    description: `Describe the implementation scope for ${planId}.`,
    tasks: [
      {
        id: 'first-task',
        title: revision === 1 ? 'First task' : 'Updated first task',
        description: 'Implement the first task',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run focused tests',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
}

async function writePlan(planId: string, source: string) {
  const plansRoot = path.join(workspace, 'appraise', 'plans')
  await fs.mkdir(plansRoot, { recursive: true })
  await fs.writeFile(path.join(plansRoot, `${planId}.yaml`), source)
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-plan-sync-project-'))
  databasePath = path.join(workspace, 'sync.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensurePlanProjectionTestSchema(databasePath)
  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('syncPlans', () => {
  it('upserts stable task projections and keeps the last valid view stale after malformed input', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({ created: 1, errors: 0 })

    const first = await client.planProjection.findUniqueOrThrow({
      where: { planId: 'checkout-flow' },
      include: { tasks: true, revisions: true },
    })
    expect(first).toMatchObject({ slug: 'checkout-flow', legacyPlanId: 'checkout-flow' })
    expect(first.tasks).toHaveLength(1)
    expect(first.revisions[0].reducedAssurance).toBe(true)
    const stableTaskId = first.tasks[0].id

    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow', 2)))
    await syncPlans({ projectDirectory: workspace, client })
    const updated = await client.planProjection.findUniqueOrThrow({
      where: { planId: 'checkout-flow' },
      include: { tasks: true },
    })
    expect(updated.tasks[0]).toMatchObject({ id: stableTaskId, title: 'Updated first task' })

    await writePlan('checkout-flow', 'version: "1"\n<<<<<<< HEAD\n')
    await writePlan('account-flow', serializeYamlArtifact('plan', plan('account-flow')))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({
      created: 1,
      errors: 1,
      stale: 1,
      conflicted: 1,
    })
    await expect(
      client.planProjection.findUniqueOrThrow({ where: { planId: 'checkout-flow' } }),
    ).resolves.toMatchObject({
      revision: 2,
      stale: true,
      conflicted: true,
    })
  })

  it('deletes missing projections without deleting linked test runs', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const environment = await client.environment.create({
      data: { name: `Plan sync ${Date.now()}`, baseUrl: 'https://example.test' },
    })
    const testRun = await client.testRun.create({
      data: {
        name: `Plan run ${Date.now()}`,
        environmentId: environment.id,
        planId: 'checkout-flow',
      },
    })

    await fs.rm(path.join(workspace, 'appraise', 'plans', 'checkout-flow.yaml'))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({ deleted: 1 })
    await expect(client.testRun.findUniqueOrThrow({ where: { id: testRun.id } })).resolves.toMatchObject({
      planId: null,
    })
  })

  it('reports invalid new plan artifacts that have no projection yet', async () => {
    await writePlan('invalid-new-flow', 'version: "1"\nversion: "1"\n')

    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({
      errors: 1,
      stale: 0,
      issues: [
        expect.objectContaining({
          planId: 'invalid-new-flow',
          artifactPath: 'appraise/plans/invalid-new-flow.yaml',
          code: 'invalid-artifact',
          projected: false,
          message: expect.stringContaining('YAML map keys must be unique'),
        }),
      ],
    })
  })
})
