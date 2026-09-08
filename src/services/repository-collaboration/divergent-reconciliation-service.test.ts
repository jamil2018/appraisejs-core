import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import {
  assertDivergentCollaborationReadyForIntegration,
  prepareDivergentCollaborationReconciliation,
  proposeDivergentCollaborationReconciliation,
  recoverDivergentCollaborationWorktree,
} from './divergent-reconciliation-service'

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
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-divergent-service-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  databases.push({ client, workspace })
  return client
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
})
