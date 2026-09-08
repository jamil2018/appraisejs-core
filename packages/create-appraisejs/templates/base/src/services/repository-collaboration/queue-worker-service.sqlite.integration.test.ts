import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration } from './binding-service'
import {
  acquireCollaborationMutationLock,
  cancelCollaborationOperation,
  heartbeatCollaborationOperation,
  notifyCollaboration,
  recordRemoteCollaborationCheck,
  recoverExpiredCollaborationLeases,
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

describe('repository collaboration queue and workers', () => {
  it('coalesces a trigger burst, then creates an immutable successor after a claim', async () => {
    const { client, binding } = await fixture()
    try {
      const first = await scheduleCollaborationOperation(schedule(binding.id, 'burst-one', 'one'), client)
      const joined = await scheduleCollaborationOperation(schedule(binding.id, 'burst-two', 'two'), client)
      expect(joined.id).toBe(first.id)
      expect(joined.idempotencyKey).toBe('burst-one')
      expect(joined.sourceRevision).toBe('two')

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
      await completeCollaborationWork(
        {
          bindingId: binding.id,
          workerIdentity: 'worker-a',
          sessionNonce: reconnected.sessionNonce,
          ...replacement!,
          proposal: { suggestedResolution: 'review required' },
          now: new Date(beginning.getTime() + 9_000),
        },
        client,
      )
      expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
        state: 'WAITING_FOR_DECISION',
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
