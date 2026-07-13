import { ResourceScope, type PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  assertProjectResourceAccess,
  importGlobalResource,
  readVisibleResourceOwnerships,
  registerProjectResourceOwnership,
} from './project-resource-ownership-service'

function ownershipClient() {
  const rows = [
    {
      id: 'project-a-module',
      entityType: 'module',
      entityId: 'module-a',
      scope: ResourceScope.project,
      targetProjectId: 'project-a',
      origin: 'proposal',
      provenanceJson: '{"localKey":"todo"}',
      contentHash: 'hash-a',
      imports: [],
    },
    {
      id: 'project-b-module',
      entityType: 'module',
      entityId: 'module-b',
      scope: ResourceScope.project,
      targetProjectId: 'project-b',
      origin: 'proposal',
      provenanceJson: '{"localKey":"todo"}',
      contentHash: 'hash-b',
      imports: [],
    },
    {
      id: 'global-step',
      entityType: 'template-step',
      entityId: 'step-global',
      scope: ResourceScope.global_library,
      targetProjectId: null,
      origin: 'promotion',
      provenanceJson: '{}',
      contentHash: 'hash-global',
      imports: [],
    },
  ]
  const imports: Array<Record<string, unknown>> = []
  return {
    projectResourceOwnership: {
      findMany: async ({ where }: { where: { entityType: { in: string[] }; OR: unknown[] } }) =>
        rows
          .filter(row => where.entityType.in.includes(row.entityType))
          .filter(
            row =>
              String(row.scope) === ResourceScope.system ||
              row.scope === ResourceScope.global_library ||
              row.targetProjectId === JSON.stringify(where.OR).match(/project-[ab]/)?.[0],
          ),
      findUnique: async ({ where }: { where: { entityType_entityId: { entityType: string; entityId: string } } }) =>
        rows.find(
          row =>
            row.entityType === where.entityType_entityId.entityType &&
            row.entityId === where.entityType_entityId.entityId,
        ) ?? null,
      upsert: async () => rows[0],
    },
    projectResourceImport: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        imports.push(create)
        return create
      },
    },
    imports,
  } as unknown as PrismaClient & { imports: Array<Record<string, unknown>> }
}

describe('project resource ownership', () => {
  it('isolates identical project-local keys and rejects guessed foreign IDs', async () => {
    const client = ownershipClient()
    const visibleA = await readVisibleResourceOwnerships('project-a', ['module'], client)
    const visibleB = await readVisibleResourceOwnerships('project-b', ['module'], client)
    expect([...visibleA!.keys()]).toEqual(['module:module-a'])
    expect([...visibleB!.keys()]).toEqual(['module:module-b'])
    await expect(
      assertProjectResourceAccess({ targetProjectId: 'project-a', entityType: 'module', entityId: 'module-b' }, client),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('records explicit immutable global imports with their source hash', async () => {
    const client = ownershipClient()
    await importGlobalResource(
      {
        targetProjectId: 'project-a',
        entityType: 'template-step',
        entityId: 'step-global',
        sharingMode: 'immutable_reference',
        actor: 'coordinator-a',
      },
      client,
    )
    expect(client.imports).toContainEqual(
      expect.objectContaining({ sourceContentHash: 'hash-global', propagationPolicy: 'immutable_hash' }),
    )
  })

  it('stores project ownership with content-bound provenance', async () => {
    await expect(
      registerProjectResourceOwnership(
        {
          targetProjectId: 'project-a',
          entityType: 'module',
          entityId: 'module-a',
          origin: 'proposal',
          provenance: { planId: 'plan-a' },
          content: { name: 'Todo' },
        },
        ownershipClient(),
      ),
    ).resolves.toMatchObject({ targetProjectId: 'project-a' })
  })
})
