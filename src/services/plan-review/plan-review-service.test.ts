import { promises as fs } from 'node:fs'
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
import { planContentHash } from '@/lib/plans/plan-hashes'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { reviseCoordinatorPlan, startCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'
import { acknowledgePlanEvent, appendPlanEvent, readPlanEvents } from '@/services/coordinator/coordinator-service'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'

import {
  addPlanRemark,
  approvePlanRevision,
  getPlanReviewDetail,
  listPlans,
  readPlanReviewSummary,
  requestPlanChanges,
  transitionPlanRemark,
} from './plan-review-service'

let workspace: string
let client: PrismaClient

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
  const artifact = await new PlanArtifactRepository(workspace).read('plan', planId)
  return planContentHash(parseYamlArtifact('plan', artifact.content) as PlanArtifact)
}

async function readReview(planId: string) {
  return parseYamlArtifact(
    'review',
    await fs.readFile(path.join(workspace, 'appraise', 'plans', 'reviews', `${planId}.review.yaml`), 'utf8'),
  ) as {
    threads: Array<{ id: string; blocking: boolean; target: unknown; events: Array<{ body?: string }> }>
    planApprovals: Array<{ revision: number; contentHash: string; relevantHashes: { plan?: string } }>
  }
}

beforeEach(async () => {
  ;({ workspace, client } = await createPlanRuntimeTestWorkspace('appraise-plan-review-', 'review.db'))
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

  it('rejects draft plans before recording approval', async () => {
    await writePlan('draft-approval-flow', serializeYamlArtifact('plan', plan('draft-approval-flow', 'draft')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('draft-approval-flow')

    await expect(
      approvePlanRevision(
        { planId: 'draft-approval-flow', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This draft has not been submitted for plan review.',
    })

    await expect(
      fs.access(path.join(workspace, 'appraise', 'plans', 'reviews', 'draft-approval-flow.review.yaml')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
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

    const transitionEvents = await readPlanEvents({ planId: 'startable-flow' }, client)
    expect(transitionEvents).toEqual([
      expect.objectContaining({ sequence: 1, type: 'plan_approved' }),
      expect.objectContaining({
        sequence: 2,
        type: 'validation_preparation_started',
        payload: { revision: 1 },
      }),
    ])
    expect(transitionEvents[0].planContentHash).toBe(expectedPlanHash)
    expect(transitionEvents[1].planContentHash).toBe(expectedPlanHash)
    expect(transitionEvents[1].previousStateHash).toBe(transitionEvents[0].stateHash)
    expect(transitionEvents[1].stateHash).not.toBe(transitionEvents[0].stateHash)
    expect(transitionEvents[1]).toMatchObject({ revision: 1, actor: 'coordinator' })
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

describe('getPlanReviewDetail', () => {
  it('does not create or fake review-ready evidence for draft plans', async () => {
    await writePlan('draft-detail-flow', serializeYamlArtifact('plan', plan('draft-detail-flow', 'draft')))
    await syncPlans({ projectDirectory: workspace, client })

    const detail = await getPlanReviewDetail('draft-detail-flow', undefined, { projectDirectory: workspace, client })

    expect(detail.reviewReady).toBe(false)
    expect(detail.events).toEqual([])
    await expect(readPlanEvents({ planId: 'draft-detail-flow' }, client)).resolves.toEqual([])
  })
})

describe('requestPlanChanges', () => {
  it('requires an open blocking remark before moving the plan to changes requested', async () => {
    await writePlan('change-loop', serializeYamlArtifact('plan', plan('change-loop')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('change-loop')

    await expect(
      requestPlanChanges(
        { planId: 'change-loop', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Add at least one open blocking remark before requesting changes.',
    })

    await addPlanRemark(
      { planId: 'change-loop', target: { type: 'plan' }, body: 'Clarify the scope before approval.', blocking: true },
      { projectDirectory: workspace, client },
    )

    await expect(
      requestPlanChanges(
        { planId: 'change-loop', displayedRevision: 1, expectedPlanHash },
        { projectDirectory: workspace, client },
      ),
    ).resolves.toMatchObject({
      planId: 'change-loop',
      plan: { revision: 1, lifecycle: 'changes_requested' },
      blockingThreads: [
        expect.objectContaining({
          blocking: true,
          latestBody: 'Clarify the scope before approval.',
          status: 'created',
        }),
      ],
      recovery: expect.objectContaining({
        revise: expect.stringContaining('plan_revise'),
      }),
    })

    const changedPlan = parseYamlArtifact(
      'plan',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'change-loop.yaml'), 'utf8'),
    ) as PlanArtifact
    expect(changedPlan.lifecycle).toBe('changes_requested')
    await expect(client.planProjection.findUniqueOrThrow({ where: { planId: 'change-loop' } })).resolves.toMatchObject({
      lifecycle: 'changes_requested',
    })
    await expect(readPlanEvents({ planId: 'change-loop' }, client)).resolves.toEqual([
      expect.objectContaining({
        sequence: 1,
        type: 'plan_changes_requested',
        payload: expect.objectContaining({
          revision: 1,
          reviewHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          blockingThreadIds: [expect.stringMatching(/^remark-/)],
        }),
      }),
    ])
  })

  it('rejects stale displayed revision, stale hash, non-blocking-only remarks, and approved plans', async () => {
    await writePlan('guarded-change-loop', serializeYamlArtifact('plan', plan('guarded-change-loop')))
    await syncPlans({ projectDirectory: workspace, client })
    const firstHash = await readPlanHash('guarded-change-loop')
    await addPlanRemark(
      {
        planId: 'guarded-change-loop',
        target: { type: 'task', taskId: 'first-task' },
        body: 'This note alone should not force a revision.',
        blocking: false,
      },
      { projectDirectory: workspace, client },
    )

    await expect(
      requestPlanChanges(
        { planId: 'guarded-change-loop', displayedRevision: 1, expectedPlanHash: firstHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'Add at least one open blocking remark before requesting changes.' })

    await writePlan(
      'guarded-change-loop',
      serializeYamlArtifact('plan', { ...plan('guarded-change-loop'), revision: 2 }),
    )
    await syncPlans({ projectDirectory: workspace, client })
    const secondHash = await readPlanHash('guarded-change-loop')
    await addPlanRemark(
      {
        planId: 'guarded-change-loop',
        target: { type: 'plan' },
        body: 'The updated revision still needs changes.',
        blocking: true,
      },
      { projectDirectory: workspace, client },
    )

    await expect(
      requestPlanChanges(
        { planId: 'guarded-change-loop', displayedRevision: 1, expectedPlanHash: secondHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'The displayed revision is stale.' })
    await expect(
      requestPlanChanges(
        { planId: 'guarded-change-loop', displayedRevision: 2, expectedPlanHash: firstHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'The displayed plan hash is stale.' })

    await writePlan(
      'approved-change-loop',
      serializeYamlArtifact('plan', plan('approved-change-loop', 'plan_approved')),
    )
    await syncPlans({ projectDirectory: workspace, client })
    const approvedHash = await readPlanHash('approved-change-loop')
    await addPlanRemark(
      { planId: 'approved-change-loop', target: { type: 'plan' }, body: 'Too late for this control.', blocking: true },
      { projectDirectory: workspace, client },
    )
    await expect(
      requestPlanChanges(
        { planId: 'approved-change-loop', displayedRevision: 1, expectedPlanHash: approvedHash },
        { projectDirectory: workspace, client },
      ),
    ).rejects.toMatchObject({ message: 'The plan has already been approved.' })
  })

  it('invalidates current-revision plan approvals while preserving review threads', async () => {
    await writePlan('approval-invalidation-loop', serializeYamlArtifact('plan', plan('approval-invalidation-loop')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('approval-invalidation-loop')
    await addPlanRemark(
      { planId: 'approval-invalidation-loop', target: { type: 'plan' }, body: 'Revise this plan.', blocking: true },
      { projectDirectory: workspace, client },
    )
    const review = await readReview('approval-invalidation-loop')
    review.planApprovals.push({
      revision: 1,
      contentHash: expectedPlanHash,
      relevantHashes: { plan: expectedPlanHash },
    })
    await fs.writeFile(
      path.join(workspace, 'appraise', 'plans', 'reviews', 'approval-invalidation-loop.review.yaml'),
      serializeYamlArtifact('review', {
        version: '1',
        planId: 'approval-invalidation-loop',
        threads: review.threads,
        planApprovals: review.planApprovals.map(approval => ({
          ...approval,
          id: 'approval-to-drop',
          approvedBy: 'local-user',
          approvedAt: new Date().toISOString(),
        })),
        fileApprovals: [],
      }),
    )

    await requestPlanChanges(
      { planId: 'approval-invalidation-loop', displayedRevision: 1, expectedPlanHash },
      { projectDirectory: workspace, client },
    )

    const changedReview = await readReview('approval-invalidation-loop')
    expect(changedReview.planApprovals).toEqual([])
    expect(changedReview.threads).toHaveLength(1)
    expect(changedReview.threads[0]).toMatchObject({
      blocking: true,
      events: [expect.objectContaining({ body: 'Revise this plan.' })],
    })
  })

  it('returns an agent-readable review summary and allows revision back to plan review', async () => {
    await writePlan('agent-readable-loop', serializeYamlArtifact('plan', plan('agent-readable-loop')))
    await syncPlans({ projectDirectory: workspace, client })
    const expectedPlanHash = await readPlanHash('agent-readable-loop')
    await addPlanRemark(
      {
        planId: 'agent-readable-loop',
        target: { type: 'task', taskId: 'first-task' },
        body: 'Make the task more specific.',
        blocking: true,
      },
      { projectDirectory: workspace, client },
    )
    await addPlanRemark(
      {
        planId: 'agent-readable-loop',
        target: { type: 'task', taskId: 'removed-task' },
        body: 'Carry this context forward.',
        blocking: false,
      },
      { projectDirectory: workspace, client },
    )
    await requestPlanChanges(
      { planId: 'agent-readable-loop', displayedRevision: 1, expectedPlanHash },
      { projectDirectory: workspace, client },
    )

    const summary = await readPlanReviewSummary('agent-readable-loop', { projectDirectory: workspace, client })
    expect(summary).toMatchObject({
      planId: 'agent-readable-loop',
      plan: { revision: 1, lifecycle: 'changes_requested' },
      blockingThreads: [
        expect.objectContaining({
          target: { type: 'task', taskId: 'first-task' },
          latestBody: 'Make the task more specific.',
          orphaned: false,
        }),
      ],
      nonBlockingThreads: [
        expect.objectContaining({
          target: { type: 'task', taskId: 'removed-task' },
          latestBody: 'Carry this context forward.',
          orphaned: true,
        }),
      ],
      orphanedThreadIds: [expect.stringMatching(/^remark-/)],
      links: { appraise: 'appraise://plans/agent-readable-loop', route: '/plans/agent-readable-loop' },
    })
    expect(summary.reviewHash).toMatch(/^sha256:[a-f0-9]{64}$/)

    const changesRequestedHash = await readPlanHash('agent-readable-loop')
    await reviseCoordinatorPlan(
      'agent-readable-loop',
      {
        ...plan('agent-readable-loop', 'changes_requested'),
        revision: 2,
        description: 'Review and approve the clarified agent-readable revision.',
      },
      changesRequestedHash,
      { projectDirectory: workspace, client },
    )
    const revisedPlan = parseYamlArtifact(
      'plan',
      await fs.readFile(path.join(workspace, 'appraise', 'plans', 'agent-readable-loop.yaml'), 'utf8'),
    ) as PlanArtifact
    expect(revisedPlan.lifecycle).toBe('awaiting_plan_review')
    expect((await readReview('agent-readable-loop')).threads).toHaveLength(2)
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
