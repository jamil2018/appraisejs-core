import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import type { Environment } from '@prisma/client'
import type { z } from 'zod'

async function checkUniqueName(name: string, targetProjectId: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.environment.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

function normalizeEnvironmentPayload(value: z.infer<typeof environmentSchema>) {
  const passwordEnvironmentVariable = value.passwordEnvironmentVariable?.trim() || null
  return {
    ...value,
    apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
    username: value.username === '' ? null : value.username,
    passwordEnvironmentVariable,
    credentialState: passwordEnvironmentVariable ? ('REFERENCE_CONFIGURED' as const) : ('NONE' as const),
    legacyCredentialDetectedAt: null,
  }
}

export async function listEnvironments(targetProjectId: string): Promise<Environment[]> {
  const environments = await prisma.environment.findMany({
    where: { targetProjectId },
    orderBy: { createdAt: 'desc' },
  })
  await automationProjectionService.syncEnvironments()
  return environments
}

export async function deleteEnvironments(ids: string[], targetProjectId: string): Promise<void> {
  await prisma.environment.deleteMany({ where: { id: { in: ids }, targetProjectId } })
  await automationProjectionService.syncEnvironments()
}

export async function createEnvironment(
  value: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<Environment> {
  const nameExists = await checkUniqueName(value.name, targetProjectId)
  if (nameExists) {
    throw new ServiceError(
      'An environment with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }
  const newEnvironment = await prisma.environment.create({
    data: { ...normalizeEnvironmentPayload(value), targetProjectId },
  })
  await automationProjectionService.syncEnvironments()
  return newEnvironment
}

export async function getEnvironmentByIdOrThrow(id: string, targetProjectId: string): Promise<Environment> {
  const environmentData = await prisma.environment.findFirst({ where: { id, targetProjectId } })
  if (!environmentData) {
    throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  }
  return environmentData
}

export async function updateEnvironment(
  id: string | undefined,
  value: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<Environment> {
  if (!id) {
    throw new ServiceError('Environment id is required', 'VALIDATION', 400)
  }
  const currentEnvironment = await prisma.environment.findFirst({
    where: { id, targetProjectId },
    select: { name: true },
  })
  if (!currentEnvironment) {
    throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  }

  if (currentEnvironment.name !== value.name) {
    const nameExists = await checkUniqueName(value.name, targetProjectId, id)
    if (nameExists) {
      throw new ServiceError(
        'An environment with this name already exists. Please choose a different name.',
        'VALIDATION',
        400,
      )
    }
  }

  const updatedEnvironment = await prisma.environment.update({
    where: { id },
    data: normalizeEnvironmentPayload(value),
  })
  await automationProjectionService.syncEnvironments()
  return updatedEnvironment
}
