import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'

import { parseYamlArtifact, type PlanArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { createCoordinatorPlan } from '@/services/coordinator/coordinator-plan-service'

import {
  acknowledgePlanEvent,
  appendPlanEvent,
  authenticateProject,
  ensureProjectIdentity,
  heartbeatCoordinator,
  ensurePlanReviewReadyEvent,
  readPlanEvents,
  registerCoordinator,
  waitForPlanEvents,
} from './coordinator-service'

let workspace: string
let databasePath: string
let client: PrismaClient

function plan(planId: string, lifecycle: PlanArtifact['lifecycle'] = 'draft'): PlanArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    lifecycle,
    goal: `Coordinate ${planId}`,
    description: `Create a reviewable coordinator plan for ${planId}.`,
    tasks: [
      {
        id: 'first-task',
        title: 'First task',
        description: 'Implement the first review task.',
        acceptanceCriteria: ['The review lifecycle is enforced.'],
        validationIntent: 'Run focused coordinator service tests.',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-coordinator-'))
  databasePath = path.join(workspace, 'coordinator.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"coordinator-test"}')
  // Test databases intentionally mirror the plan sync integration fixture.
  // fallow-ignore-next-line code-duplication
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)

  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.planProjection.create({
    data: {
      planId: 'coordinator-plan',
      revision: 1,
      lifecycle: 'draft',
      goal: 'Test coordination',
      description: 'Test durable coordinator events for a projected plan.',
      sourceHash: `sha256:${'a'.repeat(64)}`,
      planPath: 'appraise/plans/coordinator-plan.yaml',
      lastValidProjectedAt: new Date(),
    },
  })
})

afterEach(async () => {
  await client?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('project coordinator identity', () => {
  it('creates stable project credentials and rejects a wrong token', async () => {
    const first = await ensureProjectIdentity(workspace, client)
    const second = await ensureProjectIdentity(workspace, client)

    expect(second).toEqual(first)
    await expect(authenticateProject(first.projectFingerprint, first.token, client)).resolves.toBeUndefined()
    await expect(authenticateProject(first.projectFingerprint, 'wrong-token', client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('supports generic directories and reports malformed package metadata', async () => {
    await fs.rm(path.join(workspace, 'package.json'))
    const generic = await ensureProjectIdentity(workspace, client)
    expect(generic).toMatchObject({
      projectFingerprint: expect.stringMatching(/^sha256:/),
      canonicalProjectPath: await fs.realpath(workspace),
    })

    await fs.rm(path.join(workspace, '.appraisejs'), { recursive: true, force: true })
    await fs.writeFile(path.join(workspace, 'package.json'), '{')
    await expect(ensureProjectIdentity(workspace, client)).rejects.toMatchObject({
      code: 'package-json-invalid',
    })
  })
})

describe('coordinator leases', () => {
  it('rejects duplicate ownership, reconnects the same identity, and permits approved takeover', async () => {
    const now = new Date('2026-06-09T00:00:00.000Z')
    const first = await registerCoordinator({ planId: 'coordinator-plan', coordinatorId: 'agent-one' }, { client, now })

    await expect(
      registerCoordinator({ planId: 'coordinator-plan', coordinatorId: 'agent-two' }, { client, now }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const reconnected = await registerCoordinator(
      {
        planId: 'coordinator-plan',
        coordinatorId: 'agent-one',
        reconnectConnectionId: first.connectionId,
      },
      { client, now: new Date(now.getTime() + 1_000) },
    )
    expect(reconnected.connectionId).toBe(first.connectionId)

    const takeover = await registerCoordinator(
      { planId: 'coordinator-plan', coordinatorId: 'agent-two', takeoverApproved: true },
      { client, now: new Date(now.getTime() + 2_000) },
    )
    expect(takeover).toMatchObject({ coordinatorId: 'agent-two', takeoverApproved: true })
  })

  it('expires leases and rejects late heartbeats', async () => {
    const now = new Date('2026-06-09T00:00:00.000Z')
    const lease = await registerCoordinator(
      { planId: 'coordinator-plan', coordinatorId: 'agent-one' },
      { client, now, leaseMs: 100 },
    )

    await expect(
      heartbeatCoordinator(
        {
          planId: 'coordinator-plan',
          coordinatorId: 'agent-one',
          connectionId: lease.connectionId,
        },
        { client, now: new Date(now.getTime() + 101) },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    await expect(
      registerCoordinator(
        { planId: 'coordinator-plan', coordinatorId: 'agent-two' },
        { client, now: new Date(now.getTime() + 101) },
      ),
    ).resolves.toMatchObject({ coordinatorId: 'agent-two' })
  })
})

describe('review-ready event repair', () => {
  it('appends a review-ready event for sync-created awaiting-review plans', async () => {
    await client.planProjection.update({
      where: { planId: 'coordinator-plan' },
      data: { lifecycle: 'awaiting_plan_review' },
    })

    const event = await ensurePlanReviewReadyEvent('coordinator-plan', client)

    expect(event).toMatchObject({ sequence: 1, type: 'plan_review_ready' })
    await expect(readPlanEvents({ planId: 'coordinator-plan' }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'plan_review_ready' }),
    ])
    await expect(ensurePlanReviewReadyEvent('coordinator-plan', client)).resolves.toMatchObject({
      sequence: 1,
      type: 'plan_review_ready',
    })
  })

  it('does not append a review-ready event for non-reviewable plans', async () => {
    await expect(ensurePlanReviewReadyEvent('coordinator-plan', client)).resolves.toBeUndefined()
    await appendPlanEvent({ planId: 'coordinator-plan', type: 'plan_review_ready' }, client)

    await expect(readPlanEvents({ planId: 'coordinator-plan' }, client)).resolves.toEqual([])
  })
})

describe('online coordinator plan creation', () => {
  it('normalizes draft submissions to awaiting plan review before persistence, projection, hash, and event response', async () => {
    const created = await createCoordinatorPlan(plan('draft-submission'), { projectDirectory: workspace, client })
    const repository = new PlanArtifactRepository(workspace)
    const artifact = await repository.read('plan', created.planId)
    const storedPlan = parseYamlArtifact('plan', artifact.content) as PlanArtifact

    expect(created).toMatchObject({
      planId: expect.stringMatching(/^pln_[0-9a-hjkmnp-tv-z]{26}$/),
      slug: 'coordinate-draft-submission',
      legacyPlanId: 'draft-submission',
      revision: 1,
      lifecycle: 'awaiting_plan_review',
      contentHash: artifact.hash,
      eventSequence: 2,
      reviewUrl: `/plans/${created.planId}`,
      plan: { planId: created.planId, lifecycle: 'awaiting_plan_review' },
    })
    expect(storedPlan.lifecycle).toBe('awaiting_plan_review')
    await expect(client.planProjection.findUniqueOrThrow({ where: { planId: created.planId } })).resolves.toMatchObject(
      {
        slug: 'coordinate-draft-submission',
        legacyPlanId: 'draft-submission',
        lifecycle: 'awaiting_plan_review',
      },
    )
    await expect(readPlanEvents({ planId: 'draft-submission' }, client)).resolves.toEqual([
      expect.objectContaining({ sequence: 1, type: 'plan_graph_processing_started' }),
      expect.objectContaining({ sequence: 2, type: 'plan_review_ready' }),
    ])
  })

  it('accepts explicit awaiting-review submissions without changing lifecycle', async () => {
    await expect(
      createCoordinatorPlan(plan('awaiting-submission', 'awaiting_plan_review'), {
        projectDirectory: workspace,
        client,
      }),
    ).resolves.toMatchObject({
      planId: expect.stringMatching(/^pln_[0-9a-hjkmnp-tv-z]{26}$/),
      legacyPlanId: 'awaiting-submission',
      lifecycle: 'awaiting_plan_review',
      plan: { lifecycle: 'awaiting_plan_review' },
    })
  })

  it('rejects progressed lifecycle submissions for new online review plans', async () => {
    await expect(
      createCoordinatorPlan(plan('approved-submission', 'plan_approved'), { projectDirectory: workspace, client }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('only accepts draft or awaiting_plan_review'),
    })

    await expect(readPlanEvents({ planId: 'approved-submission' }, client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects ambiguous slug references instead of choosing an arbitrary plan', async () => {
    const planIds = ['pln_01jz7q1by2e4prv55bda9xf31a', 'pln_01jz7q1by2e4prv55bda9xf32a']
    await client.planProjection.createMany({
      data: planIds.map((planId, index) => ({
        planId,
        slug: 'shared-slug',
        revision: 1,
        lifecycle: 'awaiting_plan_review',
        goal: `Shared ${index}`,
        description: 'Two active plans share a slug.',
        sourceHash: `sha256:${String(index + 1).repeat(64)}`,
        planPath: `appraise/plans/${planId}.yaml`,
        lastValidProjectedAt: new Date(),
      })),
    })

    await expect(readPlanEvents({ planId: 'shared-slug' }, client)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('ambiguous'),
    })
  })
})

describe('durable plan event outbox', () => {
  it('orders and redelivers events until acknowledgement, which is idempotent', async () => {
    await appendPlanEvent({ planId: 'coordinator-plan', type: 'first' }, client)
    await appendPlanEvent({ planId: 'coordinator-plan', type: 'second', payload: { value: 2 } }, client)

    const firstRead = await readPlanEvents({ planId: 'coordinator-plan' }, client)
    const redelivery = await readPlanEvents({ planId: 'coordinator-plan' }, client)
    expect(firstRead.map(event => [event.sequence, event.type])).toEqual([
      [1, 'first'],
      [2, 'second'],
    ])
    expect(redelivery.map(event => event.id)).toEqual(firstRead.map(event => event.id))

    const acknowledged = await acknowledgePlanEvent(
      { planId: 'coordinator-plan', sequence: 1, coordinatorId: 'agent-one' },
      client,
    )
    const repeated = await acknowledgePlanEvent(
      { planId: 'coordinator-plan', sequence: 1, coordinatorId: 'agent-one' },
      client,
    )
    expect(repeated.acknowledgedAt).toEqual(acknowledged.acknowledgedAt)
    await expect(readPlanEvents({ planId: 'coordinator-plan' }, client)).resolves.toMatchObject([
      { sequence: 2, type: 'second', payload: { value: 2 } },
    ])
  })

  it('makes cancellation supersede unacknowledged progression events', async () => {
    await appendPlanEvent({ planId: 'coordinator-plan', type: 'task_updated' }, client)
    await appendPlanEvent({ planId: 'coordinator-plan', type: 'plan_cancelled' }, client)

    await expect(readPlanEvents({ planId: 'coordinator-plan' }, client)).resolves.toMatchObject([
      { sequence: 2, type: 'plan_cancelled' },
    ])
    await expect(
      client.planProjection.findUniqueOrThrow({ where: { planId: 'coordinator-plan' } }),
    ).resolves.toMatchObject({
      lifecycle: 'cancelled',
    })
  })

  it('stops long polling when the caller cancels', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      waitForPlanEvents(
        {
          planId: 'coordinator-plan',
          signal: controller.signal,
          timeoutMs: 10_000,
          pollIntervalMs: 1,
        },
        client,
      ),
    ).resolves.toEqual([])
  })
})
