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
  collaborationHash,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'

import {
  executeCollaborationGitStep,
  getCollaborationGitStatus,
  recoverCollaborationGitOperation,
} from './git-operation-service'
import { connectCollaboration, updateCollaborationPolicy } from './binding-service'

const databases: Array<{ client: PrismaClient; workspace: string }> = []

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async ({ client, workspace }) => {
      await client.$disconnect()
      await fs.rm(workspace, { recursive: true, force: true })
    }),
  )
})

async function clientFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-git-service-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  databases.push({ client, workspace })
  return client
}

const execFile = promisify(execFileCallback)

async function git(repositoryRoot: string, ...args: string[]) {
  const result = await execFile('git', ['-C', repositoryRoot, ...args], { maxBuffer: 1024 * 1024 })
  return result.stdout.trim()
}

describe('durable collaboration Git service boundaries', () => {
  it('rejects unknown persisted identifiers before any repository command can be derived', async () => {
    const client = await clientFixture()
    await expect(getCollaborationGitStatus('missing-binding', client)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(recoverCollaborationGitOperation('missing-operation', client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      executeCollaborationGitStep(
        {
          operationId: 'missing-operation',
          expectedVersion: 1,
          preparedDigest: 'a'.repeat(64),
          idempotencyKey: 'missing-operation',
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('recovers an uncertain push after the exact operation commit remains reachable from an advanced remote', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-git-recovery-'))
    const remote = path.join(workspace, 'remote.git')
    const local = path.join(workspace, 'local')
    const writer = path.join(workspace, 'writer')
    const databasePath = path.join(workspace, 'appraise.db')
    await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', remote])
    await execFile('git', ['clone', remote, local])
    for (const repository of [local]) {
      await git(repository, 'config', 'user.email', 'collaboration@example.test')
      await git(repository, 'config', 'user.name', 'Collaboration Test')
    }
    await fs.writeFile(path.join(local, 'README.md'), 'base\n')
    await git(local, 'add', 'README.md')
    await git(local, 'commit', '-m', 'base')
    const baseline = await git(local, 'rev-parse', 'HEAD')
    await git(local, 'push', 'origin', 'appraise-0.5')
    const operationRecords: CollaborationRecord[] = [
      {
        format: 'appraise.repository-collaboration/v1',
        portableProjectId: 'portable-project',
        portableId: 'recovery-module',
        version: 1,
        archived: false,
        kind: 'module',
        payload: { name: 'Recovered', parentPortableId: null },
      },
    ]
    const operationSnapshot = buildCollaborationSnapshotFiles(operationRecords, 'portable-project')
    await Promise.all(
      [...operationSnapshot.files].map(async ([relativePath, content]) => {
        const destination = path.join(local, 'appraise', 'collaboration', relativePath)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, content)
      }),
    )
    await git(local, 'add', 'appraise/collaboration')
    await git(local, 'commit', '-m', 'operation collaboration commit')
    const operationCommit = await git(local, 'rev-parse', 'HEAD')
    await git(local, 'push', 'origin', 'appraise-0.5')
    await execFile('git', ['clone', remote, writer])
    await git(writer, 'config', 'user.email', 'collaboration@example.test')
    await git(writer, 'config', 'user.name', 'Collaboration Test')
    await fs.writeFile(path.join(writer, 'README.md'), 'advanced\n')
    await git(writer, 'add', 'README.md')
    await git(writer, 'commit', '-m', 'remote advanced after operation push')
    const advancedRemote = await git(writer, 'rev-parse', 'HEAD')
    await git(writer, 'push', 'origin', 'appraise-0.5')

    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    databases.push({ client, workspace })
    const target = await client.targetProject.create({
      data: {
        id: 'push-recovery-target',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${local}`,
        canonicalPath: local,
        displayName: 'Push recovery target',
        fingerprint: `sha256:${'a'.repeat(64)}`,
      },
    })
    const binding = await connectCollaboration(
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
    const policy = await updateCollaborationPolicy(
      {
        bindingId: binding.id,
        changes: { COMMIT: true, PUSH: true },
        trustedPrincipalId: 'local-user',
        provenance: 'authenticated-host',
      },
      client,
    )
    const digest = 'a'.repeat(64)
    const createIntent = {
      schema: 'appraise.repository-collaboration.git-step-intent/v1',
      operationId: 'pending',
      operationIntent: 'PUBLISH',
      preparedDigest: digest,
      ordinal: 0,
      kind: 'CREATE_COMMIT',
      requiredPermission: 'COMMIT',
      requestVersion: 1,
      executorEpoch: 1,
      fencingToken: 1,
      sourceRevision: null,
      targetRevision: baseline,
      commit: { expectedParent: baseline, expectedSnapshotHash: operationSnapshot.snapshotHash },
    }
    const createOperation = await client.collaborationOperation.create({
      data: {
        bindingId: policy.id,
        intent: 'PUBLISH',
        trigger: 'commit-recovery-test',
        state: 'APPLYING',
        version: 2,
        idempotencyKey: 'commit-recovery',
        targetRevision: baseline,
        policyVersion: policy.policyVersion,
        preparedDigest: digest,
        acceptedDigest: digest,
        executorEpoch: 1,
        steps: {
          create: {
            ordinal: 0,
            kind: 'CREATE_COMMIT',
            state: 'RUNNING',
            requiredPermission: 'COMMIT',
            prerequisiteDigest: digest,
            requestVersion: 1,
            intentJson: JSON.stringify(createIntent),
            intentHash: collaborationHash(createIntent),
            executorEpoch: 1,
            startedVersion: 2,
            fencingToken: 1,
          },
        },
      },
    })
    const exactCreateIntent = { ...createIntent, operationId: createOperation.id }
    await client.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: createOperation.id, ordinal: 0 } },
      data: { intentJson: JSON.stringify(exactCreateIntent), intentHash: collaborationHash(exactCreateIntent) },
    })
    await expect(recoverCollaborationGitOperation(createOperation.id, client)).resolves.toMatchObject({
      state: 'READY',
      sourceRevision: operationCommit,
      targetRevision: baseline,
    })

    const operation = await client.collaborationOperation.create({
      data: {
        bindingId: policy.id,
        intent: 'PUBLISH',
        trigger: 'push-recovery-test',
        state: 'APPLYING',
        version: 2,
        idempotencyKey: 'push-recovery',
        sourceRevision: operationCommit,
        targetRevision: baseline,
        policyVersion: policy.policyVersion,
        preparedDigest: digest,
        acceptedDigest: digest,
        executorEpoch: 1,
        steps: {
          create: {
            ordinal: 0,
            kind: 'PUSH_REMOTE',
            state: 'RUNNING',
            requiredPermission: 'PUSH',
            prerequisiteDigest: digest,
            requestVersion: 1,
            intentJson: JSON.stringify({
              schema: 'appraise.repository-collaboration.git-step-intent/v1',
              operationId: 'pending',
              kind: 'PUSH_REMOTE',
            }),
            intentHash: collaborationHash({ test: 'push-recovery' }),
            executorEpoch: 1,
            startedVersion: 2,
            fencingToken: 1,
          },
        },
      },
    })
    const pushIntent = {
      schema: 'appraise.repository-collaboration.git-step-intent/v1',
      operationId: operation.id,
      operationIntent: operation.intent,
      preparedDigest: digest,
      ordinal: 0,
      kind: 'PUSH_REMOTE',
      requiredPermission: 'PUSH',
      requestVersion: 1,
      executorEpoch: 1,
      fencingToken: 1,
      sourceRevision: operationCommit,
      targetRevision: baseline,
    }
    await client.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: 0 } },
      data: { intentJson: JSON.stringify(pushIntent), intentHash: collaborationHash(pushIntent) },
    })

    await expect(recoverCollaborationGitOperation(operation.id, client)).resolves.toMatchObject({
      state: 'READY',
      sourceRevision: operationCommit,
    })
    expect(await git(local, 'ls-remote', 'origin', 'refs/heads/appraise-0.5')).toContain(advancedRemote)
    expect(
      await client.collaborationOperationStep.findUnique({
        where: { operationId_ordinal: { operationId: operation.id, ordinal: 0 } },
      }),
    ).toMatchObject({ state: 'COMPLETED', requestVersion: 1 })
  })
})
