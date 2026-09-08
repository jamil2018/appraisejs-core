import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { connectCollaboration } from './binding-service'
import { getCollaborationStatus } from './query-service'

const fixtures: Array<{ client: PrismaClient; workspace: string }> = []
const beginning = new Date('2026-09-09T00:00:00.000Z')

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async ({ client, workspace }) => {
      await client.$disconnect()
      await fs.rm(workspace, { recursive: true, force: true })
    }),
  )
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-status-'))
  await fs.mkdir(path.join(workspace, '.git'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  fixtures.push({ client, workspace })
  const target = await client.targetProject.create({
    data: {
      id: `target-${path.basename(workspace)}`,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Status fixture',
      fingerprint: `sha256:${'c'.repeat(64)}`,
    },
  })
  const binding = await connectCollaboration(
    {
      targetProjectId: target.id,
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
      portableProjectId: 'status-project',
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  return { client, binding, target }
}

describe('collaboration status scheduler boundary', () => {
  it('runs a due remote check through status exactly once per next-check window', async () => {
    const { client, binding, target } = await fixture()
    const observeRemote = vi.fn(async (bindingId: string) => expect(bindingId).toBe(binding.id))

    await expect(getCollaborationStatus(target.id, client, { now: beginning, observeRemote })).resolves.toMatchObject({
      id: binding.id,
    })
    expect(observeRemote).toHaveBeenCalledTimes(1)
    expect(await client.collaborationBinding.findUnique({ where: { id: binding.id } })).toMatchObject({
      nextRemoteCheckAt: new Date(beginning.getTime() + 300_000),
    })

    await getCollaborationStatus(target.id, client, {
      now: new Date(beginning.getTime() + 60_000),
      observeRemote,
    })
    expect(observeRemote).toHaveBeenCalledTimes(1)
  })
})
