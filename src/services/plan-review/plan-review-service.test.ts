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
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { startCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'
import { acknowledgePlanEvent, appendPlanEvent, readPlanEvents } from '@/services/coordinator/coordinator-service'

import { addPlanRemark, approvePlanRevision, listPlans, transitionPlanRemark } from './plan-review-service'

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
        // Test plans intentionally mirror the plan sync integration fixture.
        // fallow-ignore-next-line code-duplication
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

async function readPlanHash(planId: string) {
  return (await new PlanArtifactRepository(workspace).read('plan', planId)).hash
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
    const expectedPlanHash = await readPlanHash('checkout-flow')

    await approvePlanRevision(
      { planId: 'checkout-flow', displayedRevision: 1, expectedPlanHash },
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
    const review = parseYamlArtifact(
      'review',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'reviews', 'checkout-flow.review.yaml'), 'utf8'),
    ) as { planApprovals: Array<{ revision: number; contentHash: string; relevantHashes: { plan?: string } }> }
    const approvedHash = await readPlanHash('checkout-flow')
    expect(review.planApprovals).toEqual([
      expect.objectContaining({
        revision: 1,
        contentHash: approvedHash,
        relevantHashes: { plan: approvedHash },
      }),
    ])
  })

  it('emits approval notification and permits validation preparation start', async () => {
    await writePlan('startable-flow', serializeYamlArtifact('plan', plan('startable-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('startable-flow')

    await approvePlanRevision(
      { planId: 'startable-flow', displayedRevision: 1, expectedPlanHash },
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

  it('blocks plan approval after cancellation is pending', async () => {
    await writePlan('cancelled-approval-flow', serializeYamlArtifact('plan', plan('cancelled-approval-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('cancelled-approval-flow')
    await appendPlanEvent({ planId: 'cancelled-approval-flow', type: 'plan_cancelled' }, client)

    await expect(
      approvePlanRevision(
        { planId: 'cancelled-approval-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The plan has been cancelled and cannot progress.',
    })
  })

  it('blocks validation preparation after acknowledged cancellation supersedes approval', async () => {
    await writePlan('cancelled-start-flow', serializeYamlArtifact('plan', plan('cancelled-start-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('cancelled-start-flow')

    await approvePlanRevision(
      { planId: 'cancelled-start-flow', displayedRevision: 1, expectedPlanHash },
      { projectDirectory: workspace, client },
    )
    await appendPlanEvent({ planId: 'cancelled-start-flow', type: 'plan_cancelled' }, client)

    await expect(readPlanEvents({ planId: 'cancelled-start-flow' }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 2, type: 'plan_cancelled' }),
    ])
    await acknowledgePlanEvent({ planId: 'cancelled-start-flow', sequence: 2, coordinatorId: 'agent-one' }, client)

    await expect(
      startCoordinatorPlan('cancelled-start-flow', { projectDirectory: workspace, client }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The plan has been cancelled and cannot progress.',
    })
    await expect(
      client.planProjection.findUniqueOrThrow({ where: { planId: 'cancelled-start-flow' } }),
    ).resolves.toMatchObject({
      lifecycle: 'cancelled',
    })
  })

  it('rejects stale displayed revisions and stale expected plan hashes', async () => {
    await writePlan('stale-flow', serializeYamlArtifact('plan', plan('stale-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const firstHash = await readPlanHash('stale-flow')

    await writePlan(
      'stale-flow',
      serializeYamlArtifact('plan', {
        ...plan('stale-flow'),
        revision: 2,
        description: 'A higher revision with changed approval content.',
      }),
    )
    await syncPlans({ projectDirectory: workspace, client })
    const secondHash = await readPlanHash('stale-flow')

    await expect(
      approvePlanRevision(
        { planId: 'stale-flow', displayedRevision: 1, expectedPlanHash: secondHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'The displayed revision is stale.' })
    await expect(
      approvePlanRevision(
        { planId: 'stale-flow', displayedRevision: 2, expectedPlanHash: firstHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'The displayed plan hash is stale.' })
  })

  it('keeps user authority over blocking remarks and permits non-blocking carry-forward', async () => {
    await writePlan('remark-flow', serializeYamlArtifact('plan', plan('remark-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('remark-flow')

    await addPlanRemark(
      { planId: 'remark-flow', target: { type: 'plan' }, body: 'Plan-level blocker.', blocking: true },
      { projectDirectory: workspace, client },
    )
    await addPlanRemark(
      {
        planId: 'remark-flow',
        target: { type: 'task', taskId: 'first-task' },
        body: 'Task-level note.',
        blocking: false,
      },
      { projectDirectory: workspace, client },
    )

    await expect(
      approvePlanRevision(
        { planId: 'remark-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Resolve all blocking remarks before approval.' })

    const review = parseYamlArtifact(
      'review',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'reviews', 'remark-flow.review.yaml'), 'utf8'),
    ) as { threads: Array<{ id: string; blocking: boolean }> }
    const blockingThread = review.threads.find(thread => thread.blocking)
    expect(blockingThread).toBeDefined()

    await transitionPlanRemark(
      { planId: 'remark-flow', threadId: blockingThread!.id, action: 'downgraded' },
      { projectDirectory: workspace, client },
    )
    await expect(
      approvePlanRevision(
        { planId: 'remark-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects stale, conflicted, orphaned, and suspicious review projections before exact approval', async () => {
    await writePlan('guarded-flow', serializeYamlArtifact('plan', plan('guarded-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('guarded-flow')

    await client.planProjection.update({ where: { planId: 'guarded-flow' }, data: { stale: true } })
    await expect(
      approvePlanRevision(
        { planId: 'guarded-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Refresh the stale plan projection before approval.' })

    await client.planProjection.update({ where: { planId: 'guarded-flow' }, data: { stale: false, conflicted: true } })
    await expect(
      approvePlanRevision(
        { planId: 'guarded-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Resolve artifact conflicts before approval.' })

    await client.planProjection.update({ where: { planId: 'guarded-flow' }, data: { conflicted: false } })
    await addPlanRemark(
      {
        planId: 'guarded-flow',
        target: { type: 'task', taskId: 'removed-task' },
        body: 'This target no longer exists.',
        blocking: false,
      },
      { projectDirectory: workspace, client },
    )
    await expect(
      approvePlanRevision(
        { planId: 'guarded-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Retarget or resolve removed-node remarks.' })

    const review = parseYamlArtifact(
      'review',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'reviews', 'guarded-flow.review.yaml'), 'utf8'),
    ) as { threads: Array<{ id: string; blocking: boolean }> }
    await transitionPlanRemark(
      { planId: 'guarded-flow', threadId: review.threads[0]!.id, action: 'resolved' },
      { projectDirectory: workspace, client },
    )
    const projection = await client.planProjection.findUniqueOrThrow({ where: { planId: 'guarded-flow' } })
    await client.planSyncIssue.create({
      data: {
        planProjectionId: projection.id,
        code: 'suspicious-node-replacement',
        message: 'Task identity was replaced by a same-title task.',
      },
    })
    await expect(
      approvePlanRevision(
        { planId: 'guarded-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Confirm the suspicious node replacement before approval.' })
    await expect(
      approvePlanRevision(
        {
          planId: 'guarded-flow',
          displayedRevision: 1,
          expectedPlanHash,
          confirmSuspiciousReplacement: true,
        },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toBeUndefined()
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
