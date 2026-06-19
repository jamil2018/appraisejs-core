import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseYamlArtifact, serializeYamlArtifact, type PlanArtifact } from '@/lib/plan-contract'
import { syncPlans } from '@/lib/plans/plan-sync-service'

import { approvePlanRevision } from './plan-review-service'

let workspace: string
let databasePath: string
let client: PrismaClient

async function applyMigration(name: string) {
  execFileSync('sqlite3', [databasePath], {
    input: await fs.readFile(path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql')),
  })
}

function plan(planId: string): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle: 'awaiting_plan_review',
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
})
