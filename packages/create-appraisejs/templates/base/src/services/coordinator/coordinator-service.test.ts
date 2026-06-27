import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

async function applyMigration(name: string) {
  execFileSync('sqlite3', [databasePath], {
    input: await fs.readFile(path.join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql')),
  })
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-coordinator-'))
  databasePath = path.join(workspace, 'coordinator.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"coordinator-test"}')
  // Test databases intentionally mirror the plan sync integration fixture.
  // fallow-ignore-next-line code-duplication
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

  const eventTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='PlanEvent';",
  ])
    .toString()
    .trim()
  if (!eventTable) await applyMigration('20260609090000_add_plan_review_runtime')
  const identityTable = execFileSync('sqlite3', [
    databasePath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='AppraiseProjectIdentity';",
  ])
    .toString()
    .trim()
  if (!identityTable) await applyMigration('20260609160000_add_coordinator_events_api_mcp')

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
