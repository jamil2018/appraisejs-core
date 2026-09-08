import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  buildCollaborationSnapshotFiles,
  readCollaborationSnapshot,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'

import { connectCollaboration, updateCollaborationPolicy } from './binding-service'
import {
  assertDivergentCollaborationReadyForIntegration,
  prepareDivergentCollaborationReconciliation,
  proposeDivergentCollaborationReconciliation,
} from './divergent-reconciliation-service'
import {
  decideCollaborationOperation,
  executeCollaborationOperation,
  prepareCollaborationOperation,
} from './operation-service'

const workspaces: string[] = []
const execFile = promisify(execFileCallback)

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

async function git(repositoryRoot: string, ...args: string[]) {
  const result = await execFile('git', ['-C', repositoryRoot, ...args], { maxBuffer: 1024 * 1024 })
  return result.stdout.trim()
}

async function writeSnapshot(repositoryRoot: string, records: CollaborationRecord[]) {
  const snapshot = buildCollaborationSnapshotFiles(records, 'portable-project')
  await Promise.all(
    [...snapshot.files].map(async ([relativePath, content]) => {
      const destination = path.join(repositoryRoot, 'appraise', 'collaboration', relativePath)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, content)
    }),
  )
  return snapshot
}

async function commitSnapshot(repositoryRoot: string, message: string) {
  await git(repositoryRoot, 'add', 'appraise/collaboration')
  await git(repositoryRoot, 'commit', '-m', message)
  return git(repositoryRoot, 'rev-parse', 'HEAD')
}

async function executeNext(
  client: PrismaClient,
  operation: { id: string; version: number; preparedDigest: string | null; idempotencyKey: string },
) {
  return executeCollaborationOperation(
    {
      operationId: operation.id,
      expectedVersion: operation.version,
      preparedDigest: operation.preparedDigest!,
      idempotencyKey: operation.idempotencyKey,
    },
    client,
  )
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
      expect(prepared.preparedDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(await client.collaborationOperation.findUnique({ where: { id: prepared.id } })).toMatchObject({
        preparedDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(
        await client.collaborationOperationStep.findMany({
          where: { operationId: prepared.id },
          orderBy: { ordinal: 'asc' },
          select: { kind: true, requiredPermission: true },
        }),
      ).toEqual([
        { kind: 'APPLY_DATABASE', requiredPermission: 'INTEGRATE' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ])
      const applied = await executeCollaborationOperation(
        {
          operationId: prepared.id,
          expectedVersion: prepared.version,
          preparedDigest: prepared.preparedDigest!,
          idempotencyKey: 'receive-one',
        },
        client,
      )
      expect(applied.state).toBe('READY')
      const completed = await executeCollaborationOperation(
        {
          operationId: applied.id,
          expectedVersion: applied.version,
          preparedDigest: applied.preparedDigest!,
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

  it('uses the required permission stored on the next persisted step before materializing records', async () => {
    const { client, binding, target } = await fixture()
    try {
      const prepared = await prepareReceive(client, binding, 'persisted-permission', [
        moduleRecord('module-one', 'One'),
      ])
      await client.collaborationOperationStep.update({
        where: { operationId_ordinal: { operationId: prepared.id, ordinal: 0 } },
        data: { requiredPermission: 'ARCHIVE' },
      })
      await expect(executeNext(client, prepared)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(await client.module.count({ where: { targetProjectId: target.id } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })

  it('rejects conflicting decisions for one operation record instead of persisting ambiguous resolution rows', async () => {
    const { client, binding, target } = await fixture()
    try {
      const first = await prepareReceive(client, binding, 'decision-base', [moduleRecord('module-one', 'One')])
      await executeCollaborationOperation(
        {
          operationId: first.id,
          expectedVersion: first.version,
          preparedDigest: first.preparedDigest!,
          idempotencyKey: 'decision-base',
        },
        client,
      )
      await client.module.updateMany({ where: { targetProjectId: target.id }, data: { name: 'Local edit' } })
      const conflicted = await prepareReceive(client, binding, 'decision-conflict', [
        moduleRecord('module-one', 'Incoming'),
      ])
      await expect(
        decideCollaborationOperation(
          {
            operationId: conflicted.id,
            expectedVersion: conflicted.version,
            preparedDigest: conflicted.preparedDigest!,
            decisions: [
              { recordKey: 'module:module-one', decision: 'KEEP_LOCAL' },
              { recordKey: 'module:module-one', decision: 'USE_INCOMING' },
            ],
            trustedPrincipalId: 'local-user',
            provenance: 'authenticated-host',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      expect(await client.collaborationDecision.count({ where: { operationId: conflicted.id } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })

  it('returns an exact decision replay unchanged and rejects a conflicting re-decision', async () => {
    const { client, binding, target } = await fixture()
    try {
      const first = await prepareReceive(client, binding, 'replay-base', [moduleRecord('module-one', 'One')])
      await executeCollaborationOperation(
        {
          operationId: first.id,
          expectedVersion: first.version,
          preparedDigest: first.preparedDigest!,
          idempotencyKey: 'replay-base',
        },
        client,
      )
      await client.module.updateMany({ where: { targetProjectId: target.id }, data: { name: 'Local edit' } })
      const conflicted = await prepareReceive(client, binding, 'replay-conflict', [
        moduleRecord('module-one', 'Incoming'),
      ])
      const input = {
        operationId: conflicted.id,
        expectedVersion: conflicted.version,
        preparedDigest: conflicted.preparedDigest!,
        decisions: [{ recordKey: 'module:module-one', decision: 'KEEP_LOCAL' as const }],
        trustedPrincipalId: 'local-user',
        provenance: 'authenticated-host' as const,
      }
      const decided = await decideCollaborationOperation(input, client)
      await expect(decideCollaborationOperation(input, client)).resolves.toMatchObject({
        id: decided.id,
        version: decided.version,
        acceptedDigest: decided.acceptedDigest,
      })
      await expect(
        decideCollaborationOperation(
          { ...input, decisions: [{ recordKey: 'module:module-one', decision: 'USE_INCOMING' }] },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.collaborationDecision.count({ where: { operationId: conflicted.id } })).toBe(1)
    } finally {
      await client.$disconnect()
    }
  })

  it('rejects a newer-version partial request that changes an already-recorded decision', async () => {
    const { client, binding, target } = await fixture()
    try {
      const first = await prepareReceive(client, binding, 'partial-base', [
        moduleRecord('module-one', 'One'),
        moduleRecord('module-two', 'Two'),
      ])
      await executeCollaborationOperation(
        {
          operationId: first.id,
          expectedVersion: first.version,
          preparedDigest: first.preparedDigest!,
          idempotencyKey: 'partial-base',
        },
        client,
      )
      await client.module.updateMany({ where: { targetProjectId: target.id }, data: { name: 'Local edit' } })
      const conflicted = await prepareReceive(client, binding, 'partial-conflict', [
        moduleRecord('module-one', 'Incoming one'),
        moduleRecord('module-two', 'Incoming two'),
      ])
      const partial = await decideCollaborationOperation(
        {
          operationId: conflicted.id,
          expectedVersion: conflicted.version,
          preparedDigest: conflicted.preparedDigest!,
          decisions: [{ recordKey: 'module:module-one', decision: 'KEEP_LOCAL' }],
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      await expect(
        decideCollaborationOperation(
          {
            operationId: partial.id,
            expectedVersion: partial.version,
            preparedDigest: partial.preparedDigest!,
            decisions: [
              { recordKey: 'module:module-one', decision: 'USE_INCOMING' },
              { recordKey: 'module:module-two', decision: 'USE_INCOMING' },
            ],
            trustedPrincipalId: 'local-user',
            provenance: 'authenticated-host',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.collaborationDecision.findMany({
          where: { operationId: conflicted.id },
          orderBy: { recordKey: 'asc' },
          select: { recordKey: true, kind: true },
        }),
      ).toEqual([{ recordKey: 'module:module-one', kind: 'KEEP_LOCAL' }])
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
        },
        client,
      )
      const receipt = JSON.parse(completed.receiptJson!) as { publishedSnapshotHash: string }
      expect(receipt.publishedSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
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

  it('durably reconciles a reviewed snapshot through Git, SQLite, remote push, cleanup, and finalization', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-reconcile-'))
    workspaces.push(workspace)
    const remote = path.join(workspace, 'remote.git')
    const local = path.join(workspace, 'local')
    const incoming = path.join(workspace, 'incoming')
    await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', remote])
    await execFile('git', ['clone', remote, local])
    await git(local, 'config', 'user.email', 'collaboration@example.test')
    await git(local, 'config', 'user.name', 'Collaboration Test')

    const baseline = [moduleRecord('module-base', 'Base')]
    await writeSnapshot(local, baseline)
    await commitSnapshot(local, 'baseline collaboration snapshot')
    await git(local, 'push', 'origin', 'appraise-0.5')

    const targetRecords = [...baseline, moduleRecord('module-target', 'Target only')]
    await writeSnapshot(local, targetRecords)
    const targetRevision = await commitSnapshot(local, 'local collaboration change')

    await execFile('git', ['clone', remote, incoming])
    await git(incoming, 'config', 'user.email', 'collaboration@example.test')
    await git(incoming, 'config', 'user.name', 'Collaboration Test')
    const sourceRecords = [...baseline, moduleRecord('module-source', 'Source only')]
    await writeSnapshot(incoming, sourceRecords)
    const sourceRevision = await commitSnapshot(incoming, 'remote collaboration change')
    await git(incoming, 'push', 'origin', 'appraise-0.5')
    await git(local, 'fetch', 'origin', 'appraise-0.5')

    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    try {
      const target = await client.targetProject.create({
        data: {
          id: 'reconcile-target',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${local}`,
          canonicalPath: local,
          displayName: 'Reconciliation fixture',
          fingerprint: `sha256:${'b'.repeat(64)}`,
        },
      })
      const connected = await connectCollaboration(
        {
          targetProjectId: target.id,
          repositoryRoot: local,
          trackedBranch: 'appraise-0.5',
          portableProjectId: 'portable-project',
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      const binding = await updateCollaborationPolicy(
        {
          bindingId: connected.id,
          changes: { INTEGRATE: true, RESOLVE: true, PUSH: true },
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        client,
      )
      const prepared = await prepareCollaborationOperation(
        {
          bindingId: binding.id,
          intent: 'RECONCILE',
          idempotencyKey: 'reconcile-one',
          expectedPolicyVersion: binding.policyVersion,
          incomingRecords: sourceRecords,
          sourceRevision,
          targetRevision,
        },
        client,
      )
      expect(prepared.state).toBe('READY')
      expect(prepared.preparedDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(
        await client.collaborationOperationStep.findMany({
          where: { operationId: prepared.id },
          orderBy: { ordinal: 'asc' },
          select: { kind: true, requiredPermission: true },
        }),
      ).toEqual([
        { kind: 'CREATE_MERGE_COMMIT', requiredPermission: 'RESOLVE' },
        { kind: 'FAST_FORWARD_LOCAL', requiredPermission: 'INTEGRATE' },
        { kind: 'APPLY_DATABASE', requiredPermission: 'INTEGRATE' },
        { kind: 'PUSH_REMOTE', requiredPermission: 'PUSH' },
        { kind: 'CLEANUP_WORKTREE', requiredPermission: 'RESOLVE' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ])

      const proposalPreparation = await prepareDivergentCollaborationReconciliation(
        {
          operationId: prepared.id,
          expectedVersion: prepared.version,
          preparedDigest: prepared.preparedDigest!,
        },
        client,
      )
      const reviewedRecords = [...baseline, ...targetRecords.slice(1), ...sourceRecords.slice(1)]
      const reviewedSnapshot = buildCollaborationSnapshotFiles(reviewedRecords)
      const proposal = await proposeDivergentCollaborationReconciliation(
        {
          operationId: prepared.id,
          expectedVersion: prepared.version,
          preparedDigest: prepared.preparedDigest!,
          records: reviewedRecords,
        },
        client,
      )
      await assertDivergentCollaborationReadyForIntegration(
        {
          operationId: prepared.id,
          expectedVersion: prepared.version,
          preparedDigest: prepared.preparedDigest!,
          review: proposal.review,
        },
        client,
      )
      expect(proposalPreparation.operationId).toBe(prepared.id)
      expect(proposal.review.proposedSnapshotHash).toBe(reviewedSnapshot.snapshotHash)

      const merged = await executeNext(client, prepared)
      expect(merged.version).toBeGreaterThan(prepared.version)
      expect(merged.sourceRevision).toMatch(/^[a-f0-9]{40}$/)
      await expect(executeNext(client, prepared)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.collaborationOperationStep.findFirst({
          where: { operationId: prepared.id, state: 'PENDING' },
          orderBy: { ordinal: 'asc' },
          select: { kind: true },
        }),
      ).toEqual({ kind: 'FAST_FORWARD_LOCAL' })

      const integrated = await executeNext(client, merged)
      const applied = await executeNext(client, integrated)
      const pushed = await executeNext(client, applied)
      const cleaned = await executeNext(client, pushed)
      const completed = await executeNext(client, cleaned)

      const mergeCommit = merged.sourceRevision!
      expect((await git(local, 'rev-list', '--parents', '-n', '1', mergeCommit)).split(' ')).toEqual([
        mergeCommit,
        sourceRevision,
        targetRevision,
      ])
      expect((await readCollaborationSnapshot(path.join(local, 'appraise', 'collaboration'))).snapshotHash).toBe(
        reviewedSnapshot.snapshotHash,
      )
      expect(await git(local, 'ls-remote', 'origin', 'refs/heads/appraise-0.5')).toContain(mergeCommit)
      expect(await client.module.findMany({ where: { targetProjectId: target.id }, orderBy: { name: 'asc' } })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Base', collaborationManaged: true }),
          expect.objectContaining({ name: 'Source only', collaborationManaged: true }),
          expect.objectContaining({ name: 'Target only', collaborationManaged: true }),
        ]),
      )
      expect(await client.collaborationBaseline.count({ where: { repositoryRevision: mergeCommit } })).toBe(3)
      expect(completed.state).toBe('COMPLETED')
      expect(completed.completedAt).toBeTruthy()
      expect(completed.preparedDigest).toBe(prepared.preparedDigest)
      expect(completed.version).toBeGreaterThan(cleaned.version)
      expect(
        await client.collaborationOperationStep.findMany({
          where: { operationId: prepared.id },
          orderBy: { ordinal: 'asc' },
          select: { state: true },
        }),
      ).toEqual(Array.from({ length: 6 }, () => ({ state: 'COMPLETED' })))
    } finally {
      await client.$disconnect()
    }
  })
})
