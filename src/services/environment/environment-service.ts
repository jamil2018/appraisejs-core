import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import type { Environment } from '@prisma/client'
import type { z } from 'zod'

async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.environment.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

function normalizeEnvironmentPayload(value: z.infer<typeof environmentSchema>) {
  return {
    ...value,
    apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
    username: value.username === '' ? null : value.username,
    password: value.password === '' ? null : value.password,
  }
}

export async function listEnvironments(): Promise<Environment[]> {
  const environments = await prisma.environment.findMany({
    orderBy: { createdAt: 'desc' },
  })
  await automationProjectionService.syncEnvironments()
  return environments
}

export async function deleteEnvironments(ids: string[]): Promise<void> {
  await prisma.environment.deleteMany({ where: { id: { in: ids } } })
  await automationProjectionService.syncEnvironments()
}

export async function createEnvironment(value: z.infer<typeof environmentSchema>): Promise<Environment> {
  const nameExists = await checkUniqueName(value.name)
  if (nameExists) {
    throw new ServiceError(
      'An environment with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }
  const newEnvironment = await prisma.environment.create({
    data: normalizeEnvironmentPayload(value),
  })
  await automationProjectionService.syncEnvironments()
  return newEnvironment
}

export async function getEnvironmentByIdOrThrow(id: string): Promise<Environment> {
  const environmentData = await prisma.environment.findUnique({ where: { id } })
  if (!environmentData) {
    throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  }
  return environmentData
}

export async function updateEnvironment(
  id: string | undefined,
  value: z.infer<typeof environmentSchema>,
): Promise<Environment> {
  if (!id) {
    throw new ServiceError('Environment id is required', 'VALIDATION', 400)
  }
  const currentEnvironment = await prisma.environment.findUnique({
    where: { id },
    select: { name: true },
  })
  if (!currentEnvironment) {
    throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  }

  if (currentEnvironment.name !== value.name) {
    const nameExists = await checkUniqueName(value.name, id)
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

export async function checkEnvironmentNameUnique(name: string, excludeId?: string): Promise<boolean> {
  return !(await checkUniqueName(name, excludeId))
}
