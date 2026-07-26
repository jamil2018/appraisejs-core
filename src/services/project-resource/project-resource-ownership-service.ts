import { createHash } from 'node:crypto'
import { ResourceScope, type Prisma, type PrismaClient } from '@prisma/client'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

export type ProjectResourceEntityType =
  'module' | 'test-suite' | 'test-case' | 'locator-group' | 'locator' | 'environment' | 'tag' | 'step-definition'
type ResourceClient = PrismaClient | Prisma.TransactionClient

const contentHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

export async function readVisibleResourceOwnerships(
  targetProjectId: string,
  entityTypes: readonly ProjectResourceEntityType[],
  client: ResourceClient,
) {
  if (!('projectResourceOwnership' in client)) return null
  const rows = await client.projectResourceOwnership.findMany({
    where: {
      entityType: { in: [...entityTypes] },
      OR: [
        { scope: { in: [ResourceScope.system, ResourceScope.global_library] } },
        { scope: ResourceScope.project, targetProjectId },
        { imports: { some: { destinationProjectId: targetProjectId } } },
      ],
    },
    include: { imports: { where: { destinationProjectId: targetProjectId } } },
  })
  return new Map(
    rows.map(row => [
      `${row.entityType}:${row.entityId}`,
      {
        scope: row.scope,
        targetProjectId: row.targetProjectId,
        origin: row.origin,
        contentHash: row.contentHash,
        imported: row.imports.length > 0,
        sharingMode: row.imports[0]?.sharingMode ?? null,
      },
    ]),
  )
}

export async function assertProjectResourceAccess(
  input: { targetProjectId: string; entityType: ProjectResourceEntityType; entityId: string },
  client: ResourceClient,
) {
  const visible = await readVisibleResourceOwnerships(input.targetProjectId, [input.entityType], client)
  if (visible === null) return
  if (!visible.has(`${input.entityType}:${input.entityId}`))
    throw new ServiceError(
      'The requested resource is not visible in the active target project.',
      'NOT_FOUND',
      undefined,
      {
        entityType: input.entityType,
        entityId: input.entityId,
        targetProjectId: input.targetProjectId,
      },
    )
}

export async function registerProjectResourceOwnership(
  input: {
    targetProjectId: string
    entityType: ProjectResourceEntityType
    entityId: string
    origin: string
    provenance?: unknown
    content: unknown
  },
  client: ResourceClient,
) {
  const hash = contentHash(input.content)
  return client.projectResourceOwnership.upsert({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
    create: {
      entityType: input.entityType,
      entityId: input.entityId,
      scope: ResourceScope.project,
      targetProjectId: input.targetProjectId,
      origin: input.origin,
      provenanceJson: canonicalContractJson(input.provenance ?? {}),
      contentHash: hash,
    },
    update: {
      scope: ResourceScope.project,
      targetProjectId: input.targetProjectId,
      origin: input.origin,
      provenanceJson: canonicalContractJson(input.provenance ?? {}),
      contentHash: hash,
    },
  })
}

export async function importGlobalResource(
  input: {
    targetProjectId: string
    entityType: ProjectResourceEntityType
    entityId: string
    sharingMode: 'immutable_reference' | 'copy'
    actor: string
  },
  client: ResourceClient,
) {
  const ownership = await client.projectResourceOwnership.findUnique({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
  })
  if (!ownership || ownership.scope !== ResourceScope.global_library)
    throw new ServiceError('Only explicitly promoted global-library resources can be imported.', 'CONFLICT')
  return client.projectResourceImport.upsert({
    where: {
      sourceOwnershipId_destinationProjectId_sharingMode: {
        sourceOwnershipId: ownership.id,
        destinationProjectId: input.targetProjectId,
        sharingMode: input.sharingMode,
      },
    },
    create: {
      sourceOwnershipId: ownership.id,
      destinationProjectId: input.targetProjectId,
      sharingMode: input.sharingMode,
      sourceContentHash: ownership.contentHash,
      actor: input.actor,
      propagationPolicy: input.sharingMode === 'copy' ? 'detached_copy' : 'immutable_hash',
    },
    update: { actor: input.actor, sourceContentHash: ownership.contentHash },
  })
}
