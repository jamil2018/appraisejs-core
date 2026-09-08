import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import type { CollaborationRecord } from '@/lib/repository-collaboration'

import { connectCollaboration, updateCollaborationPolicy } from './binding-service'
import {
  decideCollaborationOperation,
  executeCollaborationOperation,
  prepareCollaborationOperation,
} from './operation-service'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

function moduleRecord(portableId: string, name: string): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId,
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-operation-'))
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
      displayName: 'Operation fixture',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const binding = await connectCollaboration(
    {
      targetProjectId: target.id,
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
      portableProjectId: 'portable-project',
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  const policy = await updateCollaborationPolicy(
    {
      bindingId: binding.id,
      changes: { INTEGRATE: true, RESOLVE: true, COMMIT: true },
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  return { client, binding: policy, target }
}

async function prepareReceive(
  client: PrismaClient,
  binding: { id: string; policyVersion: number },
  idempotencyKey: string,
  records: CollaborationRecord[],
) {
  return prepareCollaborationOperation(
    {
      bindingId: binding.id,
      intent: 'RECEIVE',
      idempotencyKey,
      expectedPolicyVersion: binding.policyVersion,
      incomingRecords: records,
    },
    client,
  )
}

describe('durable collaboration operations', () => {
  it('applies a dependency-closed prepared receive atomically with before images and a receipt', async () => {
    const { client, binding, target } = await fixture()
    try {
      const prepared = await prepareReceive(client, binding, 'receive-one', [moduleRecord('module-one', 'One')])
      expect(prepared.state).toBe('READY')
      const completed = await executeCollaborationOperation(
        {
          operationId: prepared.id,
          expectedVersion: prepared.version,
          preparedDigest: prepared.preparedDigest!,
          idempotencyKey: 'receive-one',
        },
        client,
      )
      expect(completed.state).toBe('COMPLETED')
      expect(await client.module.count({ where: { targetProjectId: target.id, name: 'One' } })).toBe(1)
      expect(await client.collaborationBaseline.count()).toBe(1)
      expect(
        await client.collaborationJournalEntry.count({ where: { operationId: prepared.id } }),
      ).toBeGreaterThanOrEqual(3)
      expect(completed.receiptHash).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      await client.$disconnect()
    }
  })

  it('rejects stale digests and idempotency-key reuse before any mutation', async () => {
    const { client, binding, target } = await fixture()
    try {
      const prepared = await prepareReceive(client, binding, 'receive-stale', [moduleRecord('module-one', 'One')])
      await expect(
        prepareReceive(client, binding, 'receive-stale', [moduleRecord('module-one', 'Changed')]),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        executeCollaborationOperation(
          {
            operationId: prepared.id,
            expectedVersion: prepared.version,
            preparedDigest: '0'.repeat(64),
            idempotencyKey: 'receive-stale',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.module.count({ where: { targetProjectId: target.id } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })

  it('requires a durable conflict decision and rolls back a failed multi-record materialization', async () => {
    const { client, binding, target } = await fixture()
    try {
      const first = await prepareReceive(client, binding, 'first', [moduleRecord('module-one', 'One')])
      await executeCollaborationOperation(
        {
          operationId: first.id,
          expectedVersion: first.version,
          preparedDigest: first.preparedDigest!,
          idempotencyKey: 'first',
        },
        client,
      )
      await client.module.updateMany({ where: { targetProjectId: target.id }, data: { name: 'Local edit' } })
      const conflicted = await prepareReceive(client, binding, 'conflicted', [
        moduleRecord('module-one', 'Incoming edit'),
      ])
      expect(conflicted.state).toBe('WAITING_FOR_DECISION')
      const decided = await decideCollaborationOperation(
        {
          operationId: conflicted.id,
          expectedVersion: conflicted.version,
          preparedDigest: conflicted.preparedDigest!,
          decisions: [{ recordKey: 'module:module-one', decision: 'USE_INCOMING' }],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      await executeCollaborationOperation(
        {
          operationId: decided.id,
          expectedVersion: decided.version,
          preparedDigest: decided.preparedDigest!,
          idempotencyKey: 'conflicted',
        },
        client,
      )
      expect(await client.module.findFirst({ where: { targetProjectId: target.id } })).toMatchObject({
        name: 'Incoming edit',
      })

      const invalid = await prepareReceive(client, binding, 'rollback', [
        moduleRecord('module-two', 'Duplicate'),
        moduleRecord('module-three', 'Duplicate'),
      ])
      await expect(
        executeCollaborationOperation(
          {
            operationId: invalid.id,
            expectedVersion: invalid.version,
            preparedDigest: invalid.preparedDigest!,
            idempotencyKey: 'rollback',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.module.count({ where: { targetProjectId: target.id, name: 'Duplicate' } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })

  it('publishes through durable filesystem boundaries and blocks external repository edits', async () => {
    const { client, binding, target } = await fixture()
    try {
      await client.module.create({ data: { id: 'local-module', name: 'Local', targetProjectId: target.id } })
      const first = await prepareCollaborationOperation(
        {
          bindingId: binding.id,
          intent: 'PUBLISH',
          idempotencyKey: 'publish-one',
          expectedPolicyVersion: binding.policyVersion,
        },
        client,
      )
      expect(first.state).toBe('READY')
      const completed = await executeCollaborationOperation(
        {
          operationId: first.id,
          expectedVersion: first.version,
          preparedDigest: first.preparedDigest!,
          idempotencyKey: 'publish-one',
          expectedFilesystemSnapshotHash: null,
        },
        client,
      )
      const receipt = JSON.parse(completed.receiptJson!) as { publishedSnapshotHash: string }
      const recordPath = path.join(binding.repositoryRoot, 'appraise', 'collaboration', 'modules')
      await fs.writeFile(path.join(recordPath, (await fs.readdir(recordPath))[0]!), 'external edit')
      const second = await prepareCollaborationOperation(
        {
          bindingId: binding.id,
          intent: 'PUBLISH',
          idempotencyKey: 'publish-two',
          expectedPolicyVersion: binding.policyVersion,
        },
        client,
      )
      await expect(
        executeCollaborationOperation(
          {
            operationId: second.id,
            expectedVersion: second.version,
            preparedDigest: second.preparedDigest!,
            idempotencyKey: 'publish-two',
            expectedFilesystemSnapshotHash: receipt.publishedSnapshotHash,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.collaborationOperation.findUnique({ where: { id: second.id } })).toMatchObject({
        state: 'BLOCKED',
      })
    } finally {
      await client.$disconnect()
    }
  })
})
