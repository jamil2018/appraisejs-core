import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import type { Environment } from '@prisma/client'
import type { z } from 'zod'
import { assertLoopbackOriginReservation } from './environment-origin-reservation'
import { createHash } from 'node:crypto'

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
    expectedPageTitle: value.expectedPageTitle?.trim() || null,
    username: value.username === '' ? null : value.username,
    passwordEnvironmentVariable,
    credentialState: passwordEnvironmentVariable ? ('REFERENCE_CONFIGURED' as const) : ('NONE' as const),
    legacyCredentialDetectedAt: null,
  }
}

export async function listEnvironments(targetProjectId: string): Promise<Environment[]> {
  return prisma.environment.findMany({
    where: { targetProjectId },
    orderBy: { createdAt: 'desc' },
  })
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
  await assertLoopbackOriginReservation({ baseUrl: value.baseUrl, targetProjectId }, prisma)
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

export function environmentRegistryHash(environments: Environment[]) {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify(
        environments
          .map(environment => ({
            id: environment.id,
            name: environment.name,
            baseUrl: environment.baseUrl,
            expectedPageTitle: environment.expectedPageTitle,
            apiBaseUrl: environment.apiBaseUrl,
            username: environment.username,
            credentialState: environment.credentialState,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    )
    .digest('hex')}`
}

export function environmentSummary(environment: Environment) {
  return {
    id: environment.id,
    name: environment.name,
    baseUrl: environment.baseUrl,
    expectedPageTitle: environment.expectedPageTitle,
    apiBaseUrl: environment.apiBaseUrl,
    username: environment.username,
    credentialState: environment.credentialState,
  }
}

type EnsuredEnvironment = { environment: Environment; outcome: 'resolved' | 'replayed' | 'created' }

function exactEnvironmentMatch(existing: Environment, proposal: z.infer<typeof environmentSchema>) {
  const normalized = normalizeEnvironmentPayload(proposal)
  return (
    existing.baseUrl === normalized.baseUrl &&
    existing.expectedPageTitle === normalized.expectedPageTitle &&
    existing.apiBaseUrl === normalized.apiBaseUrl &&
    existing.username === normalized.username &&
    existing.passwordEnvironmentVariable === normalized.passwordEnvironmentVariable
  )
}

async function resolveExistingEnvironment(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  environmentId: string,
  targetProjectId: string,
): Promise<EnsuredEnvironment> {
  const environment = await transaction.environment.findFirst({ where: { id: environmentId, targetProjectId } })
  if (!environment) throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  return { environment, outcome: 'resolved' }
}

async function createOrReplayEnvironment(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  proposal: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<EnsuredEnvironment> {
  const existing = await transaction.environment.findFirst({ where: { targetProjectId, name: proposal.name } })
  if (existing) {
    if (exactEnvironmentMatch(existing, proposal)) return { environment: existing, outcome: 'replayed' }
    throw new ServiceError(
      'An environment with this name already exists with different immutable preparation input.',
      'CONFLICT',
    )
  }
  await assertLoopbackOriginReservation({ baseUrl: proposal.baseUrl, targetProjectId }, transaction)
  const environment = await transaction.environment.create({
    data: { ...normalizeEnvironmentPayload(proposal), targetProjectId },
  })
  return { environment, outcome: 'created' }
}

function creationProposal(input: { allowCreate?: boolean; proposal?: unknown }) {
  if (!input.allowCreate || input.proposal === undefined)
    throw new ServiceError('Environment creation requires allowCreate: true and an explicit proposal.', 'VALIDATION')
  return environmentSchema.parse(input.proposal)
}

export async function ensureEnvironment(
  input: { environmentId?: string; allowCreate?: boolean; proposal?: unknown },
  targetProjectId: string,
) {
  const result = await prisma.$transaction(transaction =>
    input.environmentId
      ? resolveExistingEnvironment(transaction, input.environmentId, targetProjectId)
      : createOrReplayEnvironment(transaction, creationProposal(input), targetProjectId),
  )
  const projectionRepaired = await automationProjectionService.syncEnvironments()
  return { ...result, projection: projectionRepaired ? ('repaired' as const) : ('unchanged' as const) }
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

  await assertLoopbackOriginReservation({ baseUrl: value.baseUrl, targetProjectId, excludeEnvironmentId: id }, prisma)

  const updatedEnvironment = await prisma.environment.update({
    where: { id },
    data: normalizeEnvironmentPayload(value),
  })
  await automationProjectionService.syncEnvironments()
  return updatedEnvironment
}
