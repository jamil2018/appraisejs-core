import { realpath } from 'node:fs/promises'
import path from 'node:path'

import type { CollaborationPermission, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { newPortableId } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

const defaultPermissions: Array<[CollaborationPermission, boolean]> = [
  ['OBSERVE', true],
  ['PREPARE', true],
  ['INTEGRATE', false],
  ['COMMIT', false],
  ['PUSH', false],
  ['RESOLVE', false],
  ['ARCHIVE', false],
]

export interface ConnectCollaborationInput {
  targetProjectId: string
  repositoryRoot: string
  remoteName?: string
  trackedBranch: string
  portableProjectId?: string
  trustedPrincipalId: string
  provenance: 'local-ui' | 'authenticated-host'
}

export async function connectCollaboration(input: ConnectCollaborationInput, client: PrismaClient = prisma) {
  const target = await client.targetProject.findUnique({ where: { id: input.targetProjectId } })
  if (!target || target.kind !== 'LOCAL_WORKSPACE' || !target.canonicalPath) {
    throw new ServiceError('Repository collaboration requires a registered local workspace target.', 'VALIDATION', 400)
  }
  const [repositoryRoot, targetRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(target.canonicalPath),
  ])
  if (path.resolve(repositoryRoot) !== path.resolve(targetRoot)) {
    throw new ServiceError('The collaboration repository must be the selected target root.', 'VALIDATION', 400)
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(input.trackedBranch) || input.trackedBranch.startsWith('-')) {
    throw new ServiceError('The tracked branch is invalid.', 'VALIDATION', 400)
  }
  const remoteName = input.remoteName ?? 'origin'
  if (!/^[A-Za-z0-9._-]+$/.test(remoteName) || remoteName.startsWith('-')) {
    throw new ServiceError('The remote name is invalid.', 'VALIDATION', 400)
  }

  return client.$transaction(async transaction => {
    const existing = await transaction.collaborationBinding.findUnique({
      where: { targetProjectId: target.id },
    })
    if (existing) throw new ServiceError('This target already has a collaboration binding.', 'CONFLICT', 409)
    const binding = await transaction.collaborationBinding.create({
      data: {
        targetProjectId: target.id,
        portableProjectId: input.portableProjectId ?? newPortableId('project'),
        repositoryRoot,
        remoteName,
        trackedBranch: input.trackedBranch,
      },
    })
    await transaction.collaborationPolicyGrant.createMany({
      data: defaultPermissions.map(([permission, enabled]) => ({
        bindingId: binding.id,
        permission,
        enabled,
        policyVersion: binding.policyVersion,
        scopeJson: JSON.stringify({ repositoryRoot, remoteName: binding.remoteName, branch: binding.trackedBranch }),
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
      })),
    })
    return binding
  })
}

export async function updateCollaborationPolicy(
  input: {
    bindingId: string
    changes: Partial<Record<CollaborationPermission, boolean>>
    trustedPrincipalId: string
    provenance: 'local-ui' | 'authenticated-host'
  },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async transaction => {
    const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
    if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
    const policyVersion = binding.policyVersion + 1
    const current = await transaction.collaborationPolicyGrant.findMany({
      where: { bindingId: binding.id, policyVersion: binding.policyVersion, revokedAt: null },
    })
    await transaction.collaborationPolicyGrant.updateMany({
      where: { bindingId: binding.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    const byPermission = new Map(current.map(grant => [grant.permission, grant]))
    const grants: Prisma.CollaborationPolicyGrantCreateManyInput[] = defaultPermissions.map(
      ([permission, fallback]) => {
        const prior = byPermission.get(permission)
        return {
          bindingId: binding.id,
          permission,
          enabled: input.changes[permission] ?? prior?.enabled ?? fallback,
          policyVersion,
          scopeJson: prior?.scopeJson ?? '{}',
          trustedPrincipalId: input.trustedPrincipalId,
          provenance: input.provenance,
        }
      },
    )
    await transaction.collaborationPolicyGrant.createMany({ data: grants })
    return transaction.collaborationBinding.update({ where: { id: binding.id }, data: { policyVersion } })
  })
}

export async function requireCollaborationPermission(
  transaction: Prisma.TransactionClient,
  bindingId: string,
  permission: CollaborationPermission,
  expectedPolicyVersion?: number,
) {
  const binding = await transaction.collaborationBinding.findUnique({ where: { id: bindingId } })
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  if (!binding.enabled) throw new ServiceError('Collaboration is disabled for this target.', 'UNAUTHORIZED', 403)
  if (expectedPolicyVersion !== undefined && binding.policyVersion !== expectedPolicyVersion) {
    throw new ServiceError('Collaboration policy changed after preparation.', 'CONFLICT', 409)
  }
  const grant = await transaction.collaborationPolicyGrant.findFirst({
    where: { bindingId, permission, policyVersion: binding.policyVersion, enabled: true, revokedAt: null },
  })
  if (!grant) throw new ServiceError(`Collaboration permission ${permission} is not granted.`, 'UNAUTHORIZED', 403)
  return { binding, grant }
}
