import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { ServiceError } from '@/services/shared/errors'
import type { Environment, Prisma } from '@prisma/client'
import type { z } from 'zod'
import { assertLoopbackOriginReservation } from './environment-origin-reservation'
import { createHash } from 'node:crypto'
import { isSharedResourceId } from '@/lib/quality-journey/shared-resource-contract'
import {
  discoveryAuthTransitPolicyHash,
  normalizeDiscoveryAuthTransitPolicyJson,
} from '@/lib/quality-journey/discovery-auth-transit-policy'

async function checkUniqueName(
  name: string,
  targetProjectId: string,
  excludeId?: string,
  client: Pick<Prisma.TransactionClient, 'environment'> = prisma,
): Promise<boolean> {
  const existing = await client.environment.findFirst({
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
  let discoveryAuthTransitPolicyJson: string | null
  try {
    discoveryAuthTransitPolicyJson = normalizeDiscoveryAuthTransitPolicyJson(
      value.discoveryAuthTransitPolicyJson,
      new URL(value.baseUrl).origin,
    )
  } catch {
    throw new ServiceError('Discovery sign-in transit policy is invalid for this environment.', 'VALIDATION', 400)
  }
  return {
    ...value,
    apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
    expectedPageTitle: value.expectedPageTitle?.trim() || null,
    username: value.username === '' ? null : value.username,
    passwordEnvironmentVariable,
    credentialState: passwordEnvironmentVariable ? ('REFERENCE_CONFIGURED' as const) : ('NONE' as const),
    discoveryAuthTransitPolicyJson,
  }
}

export async function listEnvironments(targetProjectId: string): Promise<Environment[]> {
  return prisma.environment.findMany({
    where: { targetProjectId, archivedAt: null },
    orderBy: { createdAt: 'desc' },
  })
}

export async function deleteEnvironments(ids: string[], targetProjectId: string): Promise<void> {
  const managed = await prisma.environment.findFirst({
    where: { id: { in: ids }, targetProjectId, collaborationManaged: true },
    select: { id: true },
  })
  if (managed)
    throw new ServiceError('Collaboration-managed environments must be archived, not deleted.', 'CONFLICT', 409)
  await prisma.environment.deleteMany({
    where: { id: { in: ids }, targetProjectId, archivedAt: null, collaborationManaged: false },
  })
}

export async function createEnvironment(
  value: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<Environment> {
  return prisma.$transaction(tx => createEnvironmentInTransaction(tx, value, targetProjectId))
}

/** The manual form and exact saved-chat effect share this guarded create. */
export async function createEnvironmentInTransaction(
  tx: Prisma.TransactionClient,
  value: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<Environment> {
  const proposal = environmentSchema.parse(value)
  const nameExists = await checkUniqueName(proposal.name, targetProjectId, undefined, tx)
  if (nameExists) {
    throw new ServiceError(
      'An environment with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }
  await assertLoopbackOriginReservation({ baseUrl: proposal.baseUrl, targetProjectId }, tx)
  const newEnvironment = await tx.environment.create({
    data: { ...normalizeEnvironmentPayload(proposal), targetProjectId },
  })
  return newEnvironment
}

export async function getEnvironmentByIdOrThrow(id: string, targetProjectId: string): Promise<Environment> {
  const environmentData = await prisma.environment.findFirst({ where: { id, targetProjectId, archivedAt: null } })
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
            discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(environment.discoveryAuthTransitPolicyJson),
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
    discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(environment.discoveryAuthTransitPolicyJson),
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
    existing.passwordEnvironmentVariable === normalized.passwordEnvironmentVariable &&
    existing.discoveryAuthTransitPolicyJson === normalized.discoveryAuthTransitPolicyJson
  )
}

async function resolveExistingEnvironment(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  environmentId: string,
  targetProjectId: string,
): Promise<EnsuredEnvironment> {
  const environment = await transaction.environment.findFirst({
    where: { id: environmentId, targetProjectId, archivedAt: null },
  })
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
  return result
}

export async function updateEnvironment(
  id: string | undefined,
  value: z.infer<typeof environmentSchema>,
  targetProjectId: string,
): Promise<Environment> {
  if (!id) {
    throw new ServiceError('Environment id is required', 'VALIDATION', 400)
  }
  await prepareEnvironmentUpdate(prisma, { id, targetProjectId, nextName: value.name, baseUrl: value.baseUrl })

  const updatedEnvironment = await prisma.environment.update({
    where: { id },
    data: { ...normalizeEnvironmentPayload(value), scopeVersion: { increment: 1 } },
  })
  return updatedEnvironment
}

/** Shared manual/chat checks; the caller chooses its exact update fields and transaction owner. */
async function prepareEnvironmentUpdate(
  client: Pick<Prisma.TransactionClient, 'environment'>,
  input: {
    id: string
    targetProjectId: string
    nextName: string
    baseUrl: string
    expected?: { name: string; baseUrl: string; scopeVersion: number }
  },
) {
  const current = await client.environment.findFirst({
    where: { id: input.id, targetProjectId: input.targetProjectId, archivedAt: null, ...input.expected },
    select: { name: true },
  })
  if (!current) {
    if (input.expected)
      throw new ServiceError('The environment changed. Review its current details before renaming.', 'CONFLICT', 409)
    throw new ServiceError('Environment not found', 'NOT_FOUND', 404)
  }
  if (
    current.name !== input.nextName &&
    (await checkUniqueName(input.nextName, input.targetProjectId, input.id, client))
  )
    throw new ServiceError(
      'An environment with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  await assertLoopbackOriginReservation(
    {
      baseUrl: input.baseUrl,
      targetProjectId: input.targetProjectId,
      excludeEnvironmentId: input.id,
    },
    client,
  )
}

/** Exact same-project name-only rename; chat and the record update commit in the caller's transaction. */
export async function renameExactEnvironmentInTransaction(
  tx: Prisma.TransactionClient,
  input: { targetProjectId: string; currentName: string; baseUrl: string; nextName: string },
): Promise<{ id: string; name: string }> {
  const { targetProjectId, currentName, baseUrl, nextName } = input
  if (
    !isSharedResourceId(targetProjectId) ||
    ![currentName, nextName].every(
      name =>
        typeof name === 'string' &&
        name.trim() === name &&
        name.length > 0 &&
        name.length <= 160 &&
        Buffer.byteLength(name, 'utf8') <= 640,
    ) ||
    currentName === nextName ||
    typeof baseUrl !== 'string' ||
    baseUrl.trim() !== baseUrl ||
    baseUrl.length > 2_048
  ) {
    throw new ServiceError('Name one exact current environment and a different new name.', 'VALIDATION', 400)
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    throw new ServiceError('Environment URL is invalid.', 'VALIDATION', 400)
  }
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  )
    throw new ServiceError('Use the environment URL without credentials, query, or fragment.', 'VALIDATION', 400)
  const matches = await tx.environment.findMany({
    where: { targetProjectId, name: currentName, baseUrl, archivedAt: null },
    select: { id: true, scopeVersion: true },
    take: 2,
  })
  if (matches.length !== 1)
    throw new ServiceError(
      'The named environment and URL must identify one active environment in this project.',
      'CONFLICT',
      409,
    )
  const { id, scopeVersion } = matches[0]
  if (!Number.isSafeInteger(scopeVersion) || scopeVersion < 1 || scopeVersion >= 2_147_483_647)
    throw new ServiceError('Environment scope version is invalid. Refresh it before renaming.', 'CONFLICT', 409)
  await prepareEnvironmentUpdate(tx, {
    id,
    targetProjectId,
    nextName,
    baseUrl,
    expected: { name: currentName, baseUrl, scopeVersion },
  })
  const updated = await tx.environment.updateMany({
    where: {
      id,
      targetProjectId,
      name: currentName,
      baseUrl,
      archivedAt: null,
      scopeVersion,
    },
    data: { name: nextName, scopeVersion: { increment: 1 } },
  })
  if (updated.count !== 1)
    throw new ServiceError('The environment changed. Review its current details before renaming.', 'CONFLICT', 409)
  return { id, name: nextName }
}
