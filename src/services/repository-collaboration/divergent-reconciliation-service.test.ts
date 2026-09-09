import { promises as fs } from 'node:fs'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildCollaborationSnapshotFiles,
  collaborationHash,
  prepareDivergentReconciliation,
  readCollaborationSnapshot,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration } from './binding-service'
import {
  assertDivergentCollaborationReadyForIntegration,
  prepareDivergentCollaborationReconciliation,
  proposeDivergentCollaborationReconciliation,
  recoverDivergentCollaborationWorktree,
} from './divergent-reconciliation-service'

const databases: Array<{ client: PrismaClient; workspace: string }> = []
const repositories: string[] = []
const execFile = promisify(execFileCallback)

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async ({ client, workspace }) => {
      await client.$disconnect()
      await fs.rm(workspace, { recursive: true, force: true })
    }),
  )
  await Promise.all(repositories.splice(0).map(repository => fs.rm(repository, { recursive: true, force: true })))
})

async function clientFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-divergent-service-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  databases.push({ client, workspace })
  return client
}

async function git(repositoryRoot: string, args: string[]) {
  return execFile('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
}

function record(name: string): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'fence-project',
    portableId: 'module-one',
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

async function writeSnapshot(repositoryRoot: string, records: CollaborationRecord[]) {
  const snapshot = buildCollaborationSnapshotFiles(records, 'fence-project')
  await Promise.all(
    [...snapshot.files].map(async ([relativePath, content]) => {
      const target = path.join(repositoryRoot, 'appraise', 'collaboration', relativePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content)
    }),
  )
}

async function commitSnapshot(repositoryRoot: string, message: string, records: CollaborationRecord[]) {
  await fs.rm(path.join(repositoryRoot, 'appraise', 'collaboration'), { recursive: true, force: true })
  await writeSnapshot(repositoryRoot, records)
  await git(repositoryRoot, ['add', 'appraise/collaboration'])
  await git(repositoryRoot, ['commit', '-m', message])
  return (await git(repositoryRoot, ['rev-parse', 'HEAD'])).stdout.trim()
}

const absentPreparation = {
  operationId: 'missing-operation',
  repositoryRoot: '/missing-repository',
  worktreePath: path.join(os.tmpdir(), 'appraise-collaboration-missing-operation-not-present'),
  sourceRevision: 'a'.repeat(40),
  sourceTree: 'b'.repeat(40),
  targetRevision: 'c'.repeat(40),
  targetTree: 'd'.repeat(40),
  mergeBaseRevision: 'e'.repeat(40),
  sourceSnapshotHash: 'f'.repeat(64),
  portableProjectId: 'portable-project',
  collaborationPaths: [],
}

describe('divergent reconciliation service ownership', () => {
  it('does not derive a worktree or recovery action for unknown durable operations', async () => {
    const client = await clientFixture()
    const exact = { operationId: 'missing-operation', expectedVersion: 1, preparedDigest: 'a'.repeat(64) }

    await expect(prepareDivergentCollaborationReconciliation(exact, client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(proposeDivergentCollaborationReconciliation({ ...exact, records: [] }, client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      assertDivergentCollaborationReadyForIntegration(
        {
          ...exact,
          review: {
            preparation: absentPreparation,
            proposedSnapshotHash: '1'.repeat(64),
            proposalDigest: '2'.repeat(64),
            reviewDigest: '3'.repeat(64),
          },
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      recoverDivergentCollaborationWorktree(
        { operationId: 'missing-operation', preparation: absentPreparation },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rechecks a worker fence after validation before it can persist a proposal', async () => {
    const client = await clientFixture()
    const repositoryWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-divergent-fence-'))
    repositories.push(repositoryWorkspace)
    const repository = path.join(repositoryWorkspace, 'repository')
    await fs.mkdir(repository)
    await git(repository, ['init', '-b', 'appraise-0.5'])
    await git(repository, ['config', 'user.name', 'Appraise Test'])
    await git(repository, ['config', 'user.email', 'appraise@example.test'])
    await git(repository, ['remote', 'add', 'origin', repository])
    await fs.writeFile(path.join(repository, 'README.md'), 'fixture\n')
    await writeSnapshot(repository, [record('base')])
    await git(repository, ['add', '.'])
    await git(repository, ['commit', '-m', 'base'])
    const base = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(repository, ['checkout', '-b', 'source', base])
    const sourceRevision = await commitSnapshot(repository, 'source', [record('source')])
    await git(repository, ['checkout', 'appraise-0.5'])
    const targetRevision = await commitSnapshot(repository, 'target', [record('target')])
    const operationId = `divergent-fence-${path.basename(repositoryWorkspace)}`

    const target = await client.targetProject.create({
      data: {
        id: `target-${path.basename(repository)}`,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${repository}`,
        canonicalPath: repository,
        displayName: 'Divergent fence fixture',
        fingerprint: `sha256:${'a'.repeat(64)}`,
      },
    })
    const binding = await connectCollaboration(
      {
        targetProjectId: target.id,
        repositoryRoot: repository,
        trackedBranch: 'appraise-0.5',
        portableProjectId: 'fence-project',
        trustedPrincipalId: 'local-user',
        provenance: 'authenticated-host',
      },
      client,
    )
    const preparation = await prepareDivergentReconciliation({
      repositoryRoot: repository,
      operationId,
      sourceRevision,
      targetRevision,
    })
    const now = new Date()
    const worker = await client.collaborationWorker.create({
      data: {
        bindingId: binding.id,
        workerIdentity: 'fenced-worker',
        capabilitiesJson: '["proposal"]',
        capabilitiesHash: 'hash',
        trustedPrincipalId: 'local-user',
        provenance: 'authenticated-host',
        connectionState: 'CONNECTED',
        sessionNonceHash: 'nonce',
        expiresAt: new Date(now.getTime() + 60_000),
      },
    })
    const operation = await client.collaborationOperation.create({
      data: {
        id: operationId,
        bindingId: binding.id,
        intent: 'RECONCILE',
        trigger: 'test',
        state: 'WAITING_FOR_AGENT',
        idempotencyKey: 'fence-proposal',
        sourceRevision,
        targetRevision,
        policyVersion: binding.policyVersion,
        preparedJson: JSON.stringify({ local: [record('target')], baselines: [record('base')] }),
        preparedDigest: 'fence-digest',
        fencingToken: 1,
        leaseOwner: worker.id,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    })
    const leaseToken = 'lease-token'
    const attempt = await client.collaborationAttempt.create({
      data: {
        operationId: operation.id,
        attemptNumber: 1,
        fencingToken: 1,
        workerId: worker.id,
        state: 'RUNNING',
        claimTokenHash: createHash('sha256').update(leaseToken).digest('hex'),
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    })
    await client.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: 'DIVERGENT_PREPARATION',
        revision: 1,
        payloadJson: JSON.stringify(preparation),
        payloadHash: collaborationHash(preparation),
      },
    })

    await expect(
      proposeDivergentCollaborationReconciliation(
        {
          operationId: operation.id,
          expectedVersion: operation.version,
          preparedDigest: operation.preparedDigest!,
          records: [record('resolved')],
        },
        client,
        { attemptId: attempt.id, workerId: worker.id, fencingToken: 1, leaseToken, now },
        {
          afterValidation: async () => {
            await client.collaborationWorker.update({ where: { id: worker.id }, data: { expiresAt: now } })
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await client.collaborationOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
      state: 'WAITING_FOR_AGENT',
      version: operation.version,
    })
    expect(
      (await readCollaborationSnapshot(path.join(preparation.worktreePath, 'appraise', 'collaboration'))).snapshotHash,
    ).toBe(preparation.sourceSnapshotHash)
    await expect(
      client.collaborationJournalEntry.findFirst({
        where: { operationId: operation.id, boundary: 'DIVERGENT_PROPOSAL_MUTATION_RECOVERY', status: 'COMPLETED' },
      }),
    ).resolves.toBeTruthy()

    const replacement = await client.collaborationWorker.create({
      data: {
        bindingId: binding.id,
        workerIdentity: 'replacement-worker',
        capabilitiesJson: '["proposal"]',
        capabilitiesHash: 'replacement-hash',
        trustedPrincipalId: 'local-user',
        provenance: 'authenticated-host',
        connectionState: 'CONNECTED',
        sessionNonceHash: 'replacement-nonce',
        expiresAt: new Date(now.getTime() + 120_000),
      },
    })
    const replacementLeaseToken = 'replacement-lease-token'
    const replacementAttempt = await client.collaborationAttempt.create({
      data: {
        operationId: operation.id,
        attemptNumber: 2,
        fencingToken: 2,
        workerId: replacement.id,
        state: 'RUNNING',
        claimTokenHash: createHash('sha256').update(replacementLeaseToken).digest('hex'),
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      },
    })
    const replacementOperation = await client.collaborationOperation.update({
      where: { id: operation.id },
      data: {
        fencingToken: 2,
        leaseOwner: replacement.id,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      },
    })
    await expect(
      proposeDivergentCollaborationReconciliation(
        {
          operationId: operation.id,
          expectedVersion: replacementOperation.version,
          preparedDigest: replacementOperation.preparedDigest!,
          records: [record('replacement-resolved')],
        },
        client,
        {
          attemptId: replacementAttempt.id,
          workerId: replacement.id,
          fencingToken: 2,
          leaseToken: replacementLeaseToken,
          now,
        },
      ),
    ).resolves.toMatchObject({ requiresDecision: true })
    expect(await client.collaborationOperation.findUniqueOrThrow({ where: { id: operation.id } })).toMatchObject({
      state: 'WAITING_FOR_DECISION',
    })
  })
})
