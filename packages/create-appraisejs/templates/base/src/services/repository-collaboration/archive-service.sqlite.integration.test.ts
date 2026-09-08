import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { CollaborationRecord } from '@/lib/repository-collaboration'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration, updateCollaborationPolicy } from './binding-service'
import {
  prepareCollaborationArchive,
  prepareCollaborationRestore,
  prepareCollaborationUndo,
  recordUnseenCollaborationTombstone,
} from './archive-service'
import { decideCollaborationOperation, executeCollaborationOperation } from './operation-service'
import { projectSnapshotInTransaction } from './projection-helpers'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

function moduleRecord(portableId: string, name: string, archived = false): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId,
    version: archived ? 1 : 2,
    archived,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-archive-'))
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
      displayName: 'Archive fixture',
      fingerprint: `sha256:${'b'.repeat(64)}`,
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
      changes: { INTEGRATE: true, RESOLVE: true, ARCHIVE: true },
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  return { client, binding: policy, target }
}

describe('collaboration archive and recovery', () => {
  it('archives and restores a managed module through explicit durable tombstones', async () => {
    const { client, binding, target } = await fixture()
    try {
      const localModule = await client.module.create({
        data: { id: 'module-local', name: 'Checkout', targetProjectId: target.id },
      })
      const published = await client.$transaction(async transaction => {
        await projectSnapshotInTransaction(transaction, binding.id)
        return transaction.collaborationEntityMap.findFirst({
          where: { bindingId: binding.id, localEntityId: localModule.id },
        })
      })
      const archive = await prepareCollaborationArchive(
        {
          bindingId: binding.id,
          recordKeys: [`module:${published!.portableId}`],
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'archive-module',
        },
        client,
      )
      expect(archive.state).toBe('WAITING_FOR_DECISION')
      const decided = await decideCollaborationOperation(
        {
          operationId: archive.id,
          expectedVersion: archive.version,
          preparedDigest: archive.preparedDigest!,
          decisions: [{ recordKey: `module:${published!.portableId}`, decision: 'USE_INCOMING' }],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      const archived = await executeCollaborationOperation(
        {
          operationId: decided.id,
          expectedVersion: decided.version,
          preparedDigest: decided.preparedDigest!,
          idempotencyKey: 'archive-module',
        },
        client,
      )
      expect(archived.state).toBe('COMPLETED')
      expect(await client.module.findUnique({ where: { id: localModule.id } })).toMatchObject({
        archivedAt: expect.any(Date),
      })
      const tombstone = JSON.parse(
        (await client.collaborationBaseline.findFirst({ where: { entityMapId: published!.id } }))!.payloadJson,
      ) as CollaborationRecord
      expect(tombstone.archived).toBe(true)

      const restore = await prepareCollaborationRestore(
        {
          bindingId: binding.id,
          records: [{ ...tombstone, archived: false, version: tombstone.version + 1 }],
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'restore-module',
        },
        client,
      )
      expect(restore.state).toBe('WAITING_FOR_DECISION')
      const restoreDecided = await decideCollaborationOperation(
        {
          operationId: restore.id,
          expectedVersion: restore.version,
          preparedDigest: restore.preparedDigest!,
          decisions: [{ recordKey: `module:${published!.portableId}`, decision: 'USE_INCOMING' }],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      await executeCollaborationOperation(
        {
          operationId: restoreDecided.id,
          expectedVersion: restoreDecided.version,
          preparedDigest: restoreDecided.preparedDigest!,
          idempotencyKey: 'restore-module',
        },
        client,
      )
      expect(await client.module.findUnique({ where: { id: localModule.id } })).toMatchObject({
        archivedAt: null,
        name: 'Checkout',
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('requires dependency review before archiving an active module', async () => {
    const { client, binding, target } = await fixture()
    try {
      const localModule = await client.module.create({
        data: { id: 'module-local', name: 'Checkout', targetProjectId: target.id },
      })
      await client.locatorGroup.create({
        data: {
          id: 'group-local',
          name: 'Checkout page',
          route: '/checkout',
          moduleId: localModule.id,
          targetProjectId: target.id,
        },
      })
      const map = await client.$transaction(async transaction => {
        await projectSnapshotInTransaction(transaction, binding.id)
        return transaction.collaborationEntityMap.findFirst({
          where: { bindingId: binding.id, localEntityId: localModule.id },
        })
      })
      await expect(
        prepareCollaborationArchive(
          {
            bindingId: binding.id,
            recordKeys: [`module:${map!.portableId}`],
            expectedPolicyVersion: binding.policyVersion,
            idempotencyKey: 'archive-with-dependent',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT', details: { dependents: [expect.stringMatching(/^locator-group:/)] } })
    } finally {
      await client.$disconnect()
    }
  })

  it('persists an unseen tombstone without fabricating a module and restores only from a full record', async () => {
    const { client, binding, target } = await fixture()
    try {
      const tombstone = moduleRecord('foreign-module', 'Foreign module', true)
      const recorded = await recordUnseenCollaborationTombstone(
        {
          bindingId: binding.id,
          record: tombstone,
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'unseen-tombstone',
        },
        client,
      )
      expect(recorded.state).toBe('COMPLETED')
      expect(await client.module.count({ where: { targetProjectId: target.id } })).toBe(0)
      const entityMap = await client.collaborationEntityMap.findFirst({
        where: { bindingId: binding.id, portableId: 'foreign-module' },
        include: { baseline: true },
      })
      expect(entityMap).toMatchObject({
        localEntityId: null,
        archivedAt: expect.any(Date),
        baseline: { payloadHash: expect.any(String) },
      })

      const restore = await prepareCollaborationRestore(
        {
          bindingId: binding.id,
          records: [moduleRecord('foreign-module', 'Foreign module')],
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'restore-unseen',
        },
        client,
      )
      expect(restore.state).toBe('WAITING_FOR_DECISION')
      const decided = await decideCollaborationOperation(
        {
          operationId: restore.id,
          expectedVersion: restore.version,
          preparedDigest: restore.preparedDigest!,
          decisions: [{ recordKey: 'module:foreign-module', decision: 'USE_INCOMING' }],
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
          idempotencyKey: 'restore-unseen',
        },
        client,
      )
      expect(
        await client.module.findFirst({ where: { targetProjectId: target.id, name: 'Foreign module' } }),
      ).toMatchObject({
        archivedAt: null,
        collaborationManaged: true,
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('prepares a stale-guarded inverse from the stored database before-image', async () => {
    const { client, binding, target } = await fixture()
    try {
      const localModule = await client.module.create({
        data: { id: 'module-local', name: 'Checkout', targetProjectId: target.id },
      })
      const map = await client.$transaction(async transaction => {
        await projectSnapshotInTransaction(transaction, binding.id)
        return transaction.collaborationEntityMap.findFirst({
          where: { bindingId: binding.id, localEntityId: localModule.id },
        })
      })
      const archive = await prepareCollaborationArchive(
        {
          bindingId: binding.id,
          recordKeys: [`module:${map!.portableId}`],
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'archive-for-undo',
        },
        client,
      )
      const decided = await decideCollaborationOperation(
        {
          operationId: archive.id,
          expectedVersion: archive.version,
          preparedDigest: archive.preparedDigest!,
          decisions: [{ recordKey: `module:${map!.portableId}`, decision: 'USE_INCOMING' }],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      const completed = await executeCollaborationOperation(
        {
          operationId: decided.id,
          expectedVersion: decided.version,
          preparedDigest: decided.preparedDigest!,
          idempotencyKey: 'archive-for-undo',
        },
        client,
      )
      const undo = await prepareCollaborationUndo(
        {
          operationId: completed.id,
          expectedPolicyVersion: binding.policyVersion,
          idempotencyKey: 'undo-archive',
        },
        client,
      )
      expect(undo).toMatchObject({ intent: 'UNDO', state: 'WAITING_FOR_DECISION' })
      await client.module.update({ where: { id: localModule.id }, data: { name: 'Changed after archive' } })
      await expect(
        prepareCollaborationUndo(
          {
            operationId: completed.id,
            expectedPolicyVersion: binding.policyVersion,
            idempotencyKey: 'undo-stale',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  })
})
