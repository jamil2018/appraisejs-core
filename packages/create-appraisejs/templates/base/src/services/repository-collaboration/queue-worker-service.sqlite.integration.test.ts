import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration, updateCollaborationPolicy } from './binding-service'
import {
  acquireCollaborationMutationLock,
  cancelCollaborationOperation,
  claimCollaborationOperation,
  heartbeatCollaborationOperation,
  notifyCollaboration,
  recordRemoteCollaborationCheck,
  recoverExpiredCollaborationLeases,
  runCollaborationSchedulerTick,
  scheduleCollaborationOperation,
} from './queue-service'
import {
  claimCollaborationWork,
  completeCollaborationWork,
  createCollaborationHandoffTicket,
  getCollaborationConnectionMode,
  heartbeatCollaborationWork,
  redeemCollaborationHandoffTicket,
  registerCollaborationWorker,
} from './worker-service'

const workspaces: string[] = []
const beginning = new Date('2026-09-09T00:00:00.000Z')

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-queue-'))
  workspaces.push(workspace)
  await fs.mkdir(path.join(workspace, '.git'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  const target = await client.targetProject.create({
    data: {
      id: `target-${path.basename(workspace)}`,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Queue fixture',
      fingerprint: `sha256:${'b'.repeat(64)}`,
    },
  })
  const binding = await connectCollaboration(
    {
      targetProjectId: target.id,
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
      portableProjectId: 'queue-project',
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  return { client, binding }
}

function schedule(bindingId: string, key: string, sourceRevision: string, now = beginning) {
  return {
    bindingId,
    intent: 'RECONCILE' as const,
    idempotencyKey: key,
    trigger: 'watcher',
    policyVersion: 1,
    sourceRevision,
    now,
  }
}

async function makeDurablyPreparedDivergence(client: PrismaClient, operationId: string) {
  const preparedDigest = 'a'.repeat(64)
  await client.collaborationOperation.update({
    where: { id: operationId },
    data: {
      sourceRevision: 'b'.repeat(40),
      targetRevision: 'c'.repeat(40),
      preparedDigest,
      preparedJson: JSON.stringify({
        incoming: [
          {
            format: 'appraise.repository-collaboration/v1',
            portableProjectId: 'queue-project',
            portableId: 'queue-module',
            version: 1,
            archived: false,
            kind: 'module',
            payload: { name: 'Queue module', parentPortableId: null },
          },
        ],
      }),
    },
  })
  await client.collaborationOperationArtifact.create({
    data: {
      operationId,
      kind: 'DIVERGENT_PREPARATION',
      revision: 1,
      payloadJson: '{}',
      payloadHash: 'd'.repeat(64),
    },
  })
}

describe('repository collaboration queue and workers', () => {
  it('coalesces a trigger burst, then creates an immutable successor after a claim', async () => {
    const { client, binding } = await fixture()
    try {
      const first = await scheduleCollaborationOperation(schedule(binding.id, 'burst-one', 'one'), client)
      const joined = await scheduleCollaborationOperation(schedule(binding.id, 'burst-two', 'two'), client)
      expect(joined.id).toBe(first.id)
      expect(joined.idempotencyKey).toBe('burst-one')
      expect(joined.sourceRevision).toBe('two')
      await makeDurablyPreparedDivergence(client, first.id)

      const registration = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
        },
        client,
      )
      const claim = await claimCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          sessionNonce: registration.sessionNonce,
          now: new Date(beginning.getTime() + 2_000),
        },
        client,
      )
      expect(claim).not.toBeNull()
      const successor = await scheduleCollaborationOperation(
        schedule(binding.id, 'after-claim', 'three', new Date(beginning.getTime() + 3_000)),
        client,
      )
      expect(successor.predecessorId).toBe(first.id)
      expect(successor.queueKey).toBe('PENDING')
      expect(await client.collaborationOperation.count({ where: { bindingId: binding.id, queueKey: 'PENDING' } })).toBe(
        1,
      )
    } finally {
      await client.$disconnect()
    }
  })

  it('uses fencing tokens, expires leases, and never lets a worker complete a mutation', async () => {
    const { client, binding } = await fixture()
    try {
      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'lease', 'one'), client)
      await makeDurablyPreparedDivergence(client, operation.id)
      const registration = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
          ttlMs: 60_000,
        },
        client,
      )
      const claim = await claimCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          sessionNonce: registration.sessionNonce,
          now: new Date(beginning.getTime() + 2_000),
          leaseMs: 5_000,
        },
        client,
      )
      expect(claim).not.toBeNull()
      await expect(
        heartbeatCollaborationOperation(
          { ...claim!, workerId: 'wrong-worker', now: new Date(beginning.getTime() + 3_000) },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await heartbeatCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          sessionNonce: registration.sessionNonce,
          ...claim!,
          now: new Date(beginning.getTime() + 3_000),
          leaseMs: 2_000,
        },
        client,
      )
      await recoverExpiredCollaborationLeases(new Date(beginning.getTime() + 8_000), client)
      expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
        state: 'QUEUED',
      })

      const reconnected = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: new Date(beginning.getTime() + 8_000),
        },
        client,
      )
      const replacement = await claimCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          sessionNonce: reconnected.sessionNonce,
          now: new Date(beginning.getTime() + 8_000),
        },
        client,
      )
      expect(replacement!.fencingToken).toBeGreaterThan(claim!.fencingToken)
      await expect(
        heartbeatCollaborationOperation(
          { ...claim!, workerId: 'worker-a', now: new Date(beginning.getTime() + 8_000) },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        completeCollaborationWork(
          {
            bindingId: binding.id,
            workerIdentity: 'worker-a',
            sessionNonce: reconnected.sessionNonce,
            ...replacement!,
            proposal: { records: [] },
            now: new Date(beginning.getTime() + 9_000),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
        state: 'WAITING_FOR_AGENT',
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('does not let an unexpired lease be claimed or fenced by another worker', async () => {
    const { client, binding } = await fixture()
    try {
      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'exclusive', 'one'), client)
      await makeDurablyPreparedDivergence(client, operation.id)
      const first = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-first',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
          ttlMs: 60_000,
        },
        client,
      )
      const second = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-second',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
          ttlMs: 60_000,
        },
        client,
      )
      const claimed = await claimCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-first',
          sessionNonce: first.sessionNonce,
          now: new Date(beginning.getTime() + 2_000),
        },
        client,
      )
      await expect(
        claimCollaborationOperation(
          { operationId: operation.id, workerId: second.worker.id, now: new Date(beginning.getTime() + 3_000) },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
        fencingToken: claimed!.fencingToken,
        leaseOwner: first.worker.id,
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('allowlists worker capabilities and rejects a claim without proposal authority', async () => {
    const { client, binding } = await fixture()
    try {
      await expect(
        registerCollaborationWorker(
          {
            bindingId: binding.id,
            workerIdentity: 'unsupported-worker',
            capabilities: ['proposal', 'shell'],
            trustedPrincipalId: 'local-user',
            provenance: 'authenticated-host',
            now: beginning,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })

      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'capability-mismatch', 'one'), client)
      await makeDurablyPreparedDivergence(client, operation.id)
      const registration = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'proposal-worker',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
        },
        client,
      )
      await client.collaborationWorker.update({
        where: { id: registration.worker.id },
        data: { capabilitiesJson: '[]' },
      })

      await expect(
        claimCollaborationWork(
          {
            bindingId: binding.id,
            workerIdentity: 'proposal-worker',
            sessionNonce: registration.sessionNonce,
            now: new Date(beginning.getTime() + 2_000),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    } finally {
      await client.$disconnect()
    }
  })

  it('permits exactly one concurrent claim and blocks cancelled or revoked work', async () => {
    const { client, binding } = await fixture()
    try {
      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'concurrent', 'one'), client)
      await makeDurablyPreparedDivergence(client, operation.id)
      const [first, second] = await Promise.all(
        ['worker-first', 'worker-second'].map(workerIdentity =>
          registerCollaborationWorker(
            {
              bindingId: binding.id,
              workerIdentity,
              capabilities: ['proposal'],
              trustedPrincipalId: 'local-user',
              provenance: 'authenticated-host',
              now: beginning,
              ttlMs: 60_000,
            },
            client,
          ),
        ),
      )
      const claims = await Promise.allSettled([
        claimCollaborationOperation(
          { operationId: operation.id, workerId: first.worker.id, now: new Date(beginning.getTime() + 2_000) },
          client,
        ),
        claimCollaborationOperation(
          { operationId: operation.id, workerId: second.worker.id, now: new Date(beginning.getTime() + 2_000) },
          client,
        ),
      ])
      expect(claims.filter(claim => claim.status === 'fulfilled')).toHaveLength(1)

      const cancelled = await scheduleCollaborationOperation(schedule(binding.id, 'cancelled', 'two'), client)
      await cancelCollaborationOperation(
        { operationId: cancelled.id, reason: 'user stopped work', now: beginning },
        client,
      )
      await expect(
        claimCollaborationOperation(
          { operationId: cancelled.id, workerId: first.worker.id, now: new Date(beginning.getTime() + 2_000) },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      const revoked = await scheduleCollaborationOperation(schedule(binding.id, 'revoked', 'three'), client)
      await updateCollaborationPolicy(
        {
          bindingId: binding.id,
          changes: { PREPARE: false },
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      await expect(
        claimCollaborationOperation(
          { operationId: revoked.id, workerId: first.worker.id, now: new Date(beginning.getTime() + 2_000) },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  })

  it('runs due remote checks and expired-lease recovery in one deterministic scheduler tick', async () => {
    const { client, binding } = await fixture()
    try {
      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'scheduler', 'one'), client)
      await makeDurablyPreparedDivergence(client, operation.id)
      const worker = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'scheduler-worker',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
          ttlMs: 60_000,
        },
        client,
        async () => undefined,
      )
      await claimCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'scheduler-worker',
          sessionNonce: worker.sessionNonce,
          now: new Date(beginning.getTime() + 2_000),
          leaseMs: 1_000,
        },
        client,
      )
      const tickAt = new Date(beginning.getTime() + 4_000)
      const tick = await runCollaborationSchedulerTick(
        { now: tickAt, observeRemote: async bindingId => expect(bindingId).toBe(binding.id) },
        client,
      )
      expect(tick.recovered).toHaveLength(1)
      expect(tick.remoteChecks).toEqual([{ bindingId: binding.id, outcome: 'success' }])
      expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
        state: 'QUEUED',
      })
      expect(await client.collaborationBinding.findUnique({ where: { id: binding.id } })).toMatchObject({
        nextRemoteCheckAt: new Date(tickAt.getTime() + 300_000),
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('reconciles on worker registration but observes a remote only when it is due', async () => {
    const { client, binding } = await fixture()
    try {
      const observeRemote = vi.fn(async () => undefined)
      const reconcile = vi.fn(async ({ now }: { now: Date }, reconciliationClient: PrismaClient) =>
        runCollaborationSchedulerTick({ now, observeRemote }, reconciliationClient),
      )
      const registration = await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'reconnecting-worker',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: beginning,
        },
        client,
        reconcile,
      )
      await registerCollaborationWorker(
        {
          bindingId: binding.id,
          workerIdentity: 'reconnecting-worker',
          capabilities: ['proposal'],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
          now: new Date(beginning.getTime() + 60_000),
        },
        client,
        reconcile,
      )

      expect(registration.worker.workerIdentity).toBe('reconnecting-worker')
      expect(reconcile).toHaveBeenCalledTimes(2)
      expect(observeRemote).toHaveBeenCalledTimes(1)
      expect(await client.collaborationBinding.findUnique({ where: { id: binding.id } })).toMatchObject({
        nextRemoteCheckAt: new Date(beginning.getTime() + 300_000),
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('redeems only one scoped handoff ticket and keeps offline mode honest', async () => {
    const { client, binding } = await fixture()
    try {
      const operation = await scheduleCollaborationOperation(schedule(binding.id, 'ticket', 'one'), client)
      expect(await getCollaborationConnectionMode(binding.id, beginning, client)).toMatchObject({
        workerAvailable: false,
        nativeWakeSupported: false,
      })
      const { token } = await createCollaborationHandoffTicket(
        { bindingId: binding.id, operationId: operation.id, scope: { operation: 'proposal' }, now: beginning },
        client,
      )
      const redeemed = await redeemCollaborationHandoffTicket(
        { token, redeemedBy: 'interactive-agent', now: beginning },
        client,
      )
      expect(redeemed.operationId).toBe(operation.id)
      await expect(
        redeemCollaborationHandoffTicket({ token, redeemedBy: 'replay', now: beginning }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await cancelCollaborationOperation(
        { operationId: operation.id, reason: 'user stopped work', now: beginning },
        client,
      )
      const notification = await notifyCollaboration(
        {
          bindingId: binding.id,
          operationId: operation.id,
          dedupeKey: 'cancelled',
          kind: 'cancelled',
          message: 'Stopped',
          actionable: true,
        },
        client,
      )
      const duplicate = await notifyCollaboration(
        {
          bindingId: binding.id,
          operationId: operation.id,
          dedupeKey: 'cancelled',
          kind: 'cancelled',
          message: 'Still stopped',
          actionable: true,
        },
        client,
      )
      expect(duplicate.id).toBe(notification.id)
      const lock = await acquireCollaborationMutationLock(
        { lockKey: `repository:${binding.repositoryRoot}`, ownerId: 'appraise', now: beginning },
        client,
      )
      await expect(
        acquireCollaborationMutationLock({ lockKey: lock.lockKey, ownerId: 'another-mutator', now: beginning }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const remote = await recordRemoteCollaborationCheck(
        { bindingId: binding.id, outcome: 'transient_failure', now: beginning },
        client,
      )
      expect(remote.nextRemoteCheckAt).toEqual(new Date(beginning.getTime() + 600_000))
    } finally {
      await client.$disconnect()
    }
  })
})
