import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { collaborationHash } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

export async function mapCollaborationEnvironment(
  input: {
    bindingId: string
    portableId: string
    localEnvironmentId: string
    expectedScopeVersion: number
  },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async transaction => {
    const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
    if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
    const environment = await transaction.environment.findFirst({
      where: { id: input.localEnvironmentId, targetProjectId: binding.targetProjectId, archivedAt: null },
    })
    if (!environment) throw new ServiceError('Active local environment was not found.', 'NOT_FOUND', 404)
    if (environment.scopeVersion !== input.expectedScopeVersion) {
      throw new ServiceError('Environment changed before collaboration mapping.', 'CONFLICT', 409)
    }
    const mappingHash = collaborationHash({
      bindingId: binding.id,
      portableId: input.portableId,
      localEnvironmentId: environment.id,
      localScopeVersion: environment.scopeVersion,
    })
    return transaction.collaborationEnvironmentMapping.upsert({
      where: { bindingId_portableId: { bindingId: binding.id, portableId: input.portableId } },
      create: {
        bindingId: binding.id,
        portableId: input.portableId,
        localEnvironmentId: environment.id,
        localScopeVersion: environment.scopeVersion,
        mappingHash,
      },
      update: {
        localEnvironmentId: environment.id,
        localScopeVersion: environment.scopeVersion,
        mappingHash,
      },
    })
  })
}
