import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import {
  executeCollaborationGitStep,
  getCollaborationGitStatus,
  recoverCollaborationGitOperation,
} from './git-operation-service'

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
          step: 'FETCH',
        },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
