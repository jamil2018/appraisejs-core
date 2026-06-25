import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type PlanLifecycleState,
} from '@/lib/plan-contract'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { startCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'
import { readPlanEvents } from '@/services/coordinator/coordinator-service'

import { approvePlanRevision, listPlans } from './plan-review-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function applyMigration(name: string) {
  execFileSync('sqlite3', [databasePath], {
    input: await fs.readFile(path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql')),
  })
}

function plan(planId: string, lifecycle: PlanLifecycleState = 'awaiting_plan_review'): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle,
    goal: `Review ${planId}`,
    description: `Review and approve the exact ${planId} revision.`,
    tasks: [
      {
        id: 'first-task',
        title: 'First task',
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
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-plan-review-'))
  databasePath = path.join(workspace, 'review.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)

  const projectionTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='PlanProjection';",
  ])
    .toString()
    .trim()
  if (!projectionTable) await applyMigration('20260609002500_add_plan_projection_and_sync')

  const descriptionColumn = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM pragma_table_info('PlanProjection') WHERE name='description';",
  ])
    .toString()
    .trim()
  if (!descriptionColumn) await applyMigration('20260613015000_add_plan_description')

  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('approvePlanRevision', () => {
  it('records the exact revision approval and promotes the plan lifecycle', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await syncPlans({ projectDirectory: workspace, client })

    await approvePlanRevision(
      { planId: 'checkout-flow', displayedRevision: 1 },
      { projectDirectory: workspace, client },
    )

    const approvedPlan = parseYamlArtifact(
      'plan',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'checkout-flow.yaml'), 'utf8'),
    ) as PlanArtifact
    expect(approvedPlan.lifecycle).toBe('plan_approved')

    await expect(
      client.planProjection.findUniqueOrThrow({ where: { planId: 'checkout-flow' } }),
    ).resolves.toMatchObject({
      lifecycle: 'plan_approved',
    })
  })

  it('emits approval notification and permits validation preparation start', async () => {
    await writePlan('startable-flow', serializeYamlArtifact('plan', plan('startable-flow')))
    await syncPlans({ projectDirectory: workspace, client })

    await approvePlanRevision(
      { planId: 'startable-flow', displayedRevision: 1 },
      { projectDirectory: workspace, client },
    )

    await expect(readPlanEvents({ planId: 'startable-flow' }, client)).resolves.toEqual([
      expect.objectContaining({
        sequence: 1,
        type: 'plan_approved',
        payload: { revision: 1 },
      }),
    ])

    await expect(
      startCoordinatorPlan('startable-flow', { projectDirectory: workspace, client }),
    ).resolves.toMatchObject({
      plan: { lifecycle: 'preparing_validations' },
    })

    await expect(readPlanEvents({ planId: 'startable-flow' }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'plan_approved' }),
      expect.objectContaining({
        sequence: 2,
        type: 'validation_preparation_started',
        payload: { revision: 1 },
      }),
    ])
  })
})

describe('listPlans', () => {
  it('discovers pending, stale, conflicted, awaiting-review, approved, cancelled, and completed plans', async () => {
    const lifecycles = [
      ['pending-flow', 'draft'],
      ['awaiting-review-flow', 'awaiting_plan_review'],
      ['approved-flow', 'plan_approved'],
      ['cancelled-flow', 'cancelled'],
      ['completed-flow', 'completed'],
      ['stale-flow', 'awaiting_plan_review'],
      ['conflicted-flow', 'awaiting_plan_review'],
    ] as const satisfies ReadonlyArray<readonly [string, PlanLifecycleState]>

    for (const [planId, lifecycle] of lifecycles) {
      await writePlan(planId, serializeYamlArtifact('plan', plan(planId, lifecycle)))
    }
    await syncPlans({ projectDirectory: workspace, client })
    await client.planProjection.update({ where: { planId: 'stale-flow' }, data: { stale: true } })
    await client.planProjection.update({ where: { planId: 'conflicted-flow' }, data: { conflicted: true } })

    const discovered = await listPlans({ projectDirectory: workspace, client })
    const byId = new Map(discovered.map(projectedPlan => [projectedPlan.planId, projectedPlan]))

    expect([...byId.keys()]).toEqual(expect.arrayContaining(lifecycles.map(([planId]) => planId)))
    expect(byId.get('pending-flow')).toMatchObject({ lifecycle: 'draft', stale: false, conflicted: false })
    expect(byId.get('awaiting-review-flow')).toMatchObject({
      lifecycle: 'awaiting_plan_review',
      stale: false,
      conflicted: false,
    })
    expect(byId.get('approved-flow')).toMatchObject({ lifecycle: 'plan_approved', stale: false, conflicted: false })
    expect(byId.get('cancelled-flow')).toMatchObject({ lifecycle: 'cancelled', stale: false, conflicted: false })
    expect(byId.get('completed-flow')).toMatchObject({ lifecycle: 'completed', stale: false, conflicted: false })
    expect(byId.get('stale-flow')).toMatchObject({ lifecycle: 'awaiting_plan_review', stale: true })
    expect(byId.get('conflicted-flow')).toMatchObject({ lifecycle: 'awaiting_plan_review', conflicted: true })
  })
})
