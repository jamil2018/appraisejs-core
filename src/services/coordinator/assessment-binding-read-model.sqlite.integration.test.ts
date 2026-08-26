import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { ServiceError } from '@/services/shared/errors'

import { readTargetBoundLocators } from './assessment-binding-read-model'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('assessment binding locator ownership', () => {
  it('rejects a target-owned locator whose locator group belongs to a different target', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-binding-ownership-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await client.targetProject.createMany({
        data: [
          {
            id: 'target-bound',
            kind: 'LOCAL_WORKSPACE',
            canonicalIdentity: `path:${workspace}/bound`,
            canonicalPath: `${workspace}/bound`,
            displayName: 'Bound',
            fingerprint: `sha256:${'a'.repeat(64)}`,
          },
          {
            id: 'target-foreign',
            kind: 'LOCAL_WORKSPACE',
            canonicalIdentity: `path:${workspace}/foreign`,
            canonicalPath: `${workspace}/foreign`,
            displayName: 'Foreign',
            fingerprint: `sha256:${'b'.repeat(64)}`,
          },
        ],
      })
      await client.module.create({
        data: { id: 'foreign-module', name: 'Foreign', targetProjectId: 'target-foreign' },
      })
      await client.locatorGroup.create({
        data: {
          id: 'foreign-group',
          name: 'Foreign controls',
          route: '/',
          moduleId: 'foreign-module',
          targetProjectId: 'target-foreign',
        },
      })
      // Prisma's relation permits this legacy/corrupt cross-target row. The
      // compact assessment boundary must never convert it into a logical node.
      await client.locator.create({
        data: {
          id: 'cross-target-locator',
          name: 'Cross-target locator',
          value: '#foreign',
          locatorGroupId: 'foreign-group',
          targetProjectId: 'target-bound',
        },
      })
      await client.locatorGroup.create({
        data: {
          id: 'foreign-module-group',
          name: 'Foreign module controls',
          route: '/mixed',
          moduleId: 'foreign-module',
          targetProjectId: 'target-bound',
        },
      })
      await client.locator.create({
        data: {
          id: 'foreign-module-locator',
          name: 'Foreign-module locator',
          value: '#foreign-module',
          locatorGroupId: 'foreign-module-group',
          targetProjectId: 'target-bound',
        },
      })

      for (const locatorId of ['cross-target-locator', 'foreign-module-locator'])
        await expect(
          readTargetBoundLocators(
            [{ locatorIds: [locatorId] }],
            'target-bound',
            () => {
              throw new Error('Unexpected duplicate')
            },
            client as never,
          ),
        ).rejects.toMatchObject({
          code: 'CONFLICT',
          details: { code: 'foreign_locator_group' },
        } satisfies Partial<ServiceError>)
      expect(await client.locator.findUniqueOrThrow({ where: { id: 'cross-target-locator' } })).toMatchObject({
        targetProjectId: 'target-bound',
        locatorGroupId: 'foreign-group',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
