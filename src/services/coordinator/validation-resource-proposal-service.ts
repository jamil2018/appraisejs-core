import { createHash } from 'node:crypto'
import { type Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { registerProjectResourceOwnership } from '@/services/project-resource/project-resource-ownership-service'
import { ServiceError } from '@/services/shared/errors'
import { readValidationContext } from './validation-authoring-context-service'
import { assertLoopbackOriginReservation } from '@/services/environment/environment-origin-reservation'
import {
  type ValidationResourceProposal as Proposal,
  validationResourceProposalSchema,
} from './validation-resource-proposal-contract'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const stableId = (targetProjectId: string, entityType: string, localKey: string) =>
  `apr-${createHash('sha256').update(`${targetProjectId}:${entityType}:${localKey}`).digest('hex').slice(0, 24)}`

function proposalBindings(
  proposal: Proposal,
  ids: Awaited<ReturnType<typeof persistProposalGraph>>,
  targetProjectId: string,
) {
  return {
    environments: proposal.environments.map(item => ({
      localKey: item.localKey,
      id: ids.environments[item.localKey],
      reference: ids.environments[item.localKey],
      disposition: 'reused_or_created' as const,
    })),
    locatorGroups: proposal.locatorGroups.map(item => ({
      localKey: item.localKey,
      id: ids.locatorGroups[item.localKey],
      astRef: `group_${ids.locatorGroups[item.localKey]}`,
      version: '1',
      targetProjectId,
      moduleId: ids.modules[item.moduleKey],
      disposition: 'reused_or_created' as const,
    })),
    locators: proposal.locators.map(item => {
      const group = proposal.locatorGroups.find(candidate => candidate.localKey === item.groupKey)!
      return {
        localKey: item.localKey,
        id: ids.locators[item.localKey],
        astRef: `locator_${ids.locators[item.localKey]}`,
        version: '1',
        targetProjectId,
        moduleId: ids.modules[group.moduleKey],
        locatorGroupId: ids.locatorGroups[item.groupKey],
        locatorGroupAstRef: `group_${ids.locatorGroups[item.groupKey]}`,
        disposition: 'reused_or_created' as const,
      }
    }),
  }
}

type Transaction = Prisma.TransactionClient

function modulesInDependencyOrder(modules: Proposal['modules']) {
  const pending = new Map(modules.map(item => [item.localKey, item]))
  const ordered: Proposal['modules'] = []
  while (pending.size) {
    const ready = [...pending.values()].filter(item => !item.parentKey || !pending.has(item.parentKey))
    if (!ready.length) throw new ServiceError('Module parent relationships must be acyclic.', 'VALIDATION')
    for (const item of ready) {
      ordered.push(item)
      pending.delete(item.localKey)
    }
  }
  return ordered
}

// fallow-ignore-next-line complexity
async function persistProposalGraph(proposal: Proposal, targetProjectId: string, planId: string, tx: Transaction) {
  const ids = {
    modules: Object.fromEntries(
      proposal.modules.map(item => [item.localKey, stableId(targetProjectId, 'module', item.localKey)]),
    ),
    locatorGroups: Object.fromEntries(
      proposal.locatorGroups.map(item => [item.localKey, stableId(targetProjectId, 'locator-group', item.localKey)]),
    ),
    locators: Object.fromEntries(
      proposal.locators.map(item => [item.localKey, stableId(targetProjectId, 'locator', item.localKey)]),
    ),
    environments: Object.fromEntries(
      proposal.environments.map(item => [item.localKey, stableId(targetProjectId, 'environment', item.localKey)]),
    ),
  }
  for (const item of modulesInDependencyOrder(proposal.modules)) {
    const matches = await tx.module.findMany({
      where: { targetProjectId, name: item.name },
      select: { id: true },
      take: 2,
    })
    if (matches.length > 1)
      throw new ServiceError(`Module "${item.name}" is ambiguous in the target project.`, 'CONFLICT')
    if (matches[0]) ids.modules[item.localKey] = matches[0].id
  }
  for (const item of proposal.locatorGroups) {
    const existing = await tx.locatorGroup.findFirst({
      where: { targetProjectId, name: item.name },
      select: { id: true, moduleId: true, route: true },
    })
    if (!existing) continue
    if (existing.moduleId !== ids.modules[item.moduleKey] || existing.route !== item.route)
      throw new ServiceError(
        `Locator group "${item.name}" already exists with different module or route ownership.`,
        'CONFLICT',
      )
    ids.locatorGroups[item.localKey] = existing.id
  }
  for (const item of proposal.locators) {
    const locatorGroupId = ids.locatorGroups[item.groupKey]
    const matches = await tx.locator.findMany({
      where: { targetProjectId, locatorGroupId, name: item.name },
      select: { id: true, value: true },
      take: 2,
    })
    if (matches.length > 1)
      throw new ServiceError(`Locator "${item.name}" is ambiguous in its locator group.`, 'CONFLICT')
    if (!matches[0]) continue
    if (matches[0].value !== item.selector)
      throw new ServiceError(`Locator "${item.name}" already exists with a different selector.`, 'CONFLICT')
    ids.locators[item.localKey] = matches[0].id
  }
  for (const item of proposal.environments) {
    await assertLoopbackOriginReservation({ baseUrl: item.baseUrl, targetProjectId }, tx)
    const existing = await tx.environment.findFirst({
      where: { targetProjectId, name: item.name },
      select: { id: true, baseUrl: true, apiBaseUrl: true, expectedPageTitle: true },
    })
    if (!existing) continue
    if (
      existing.baseUrl !== item.baseUrl ||
      existing.apiBaseUrl !== (item.apiBaseUrl ?? null) ||
      existing.expectedPageTitle !== (item.expectedPageTitle ?? null)
    )
      throw new ServiceError(`Environment "${item.name}" already exists with different URLs.`, 'CONFLICT')
    ids.environments[item.localKey] = existing.id
  }
  for (const item of modulesInDependencyOrder(proposal.modules)) {
    const data = {
      id: ids.modules[item.localKey],
      name: item.name,
      parentId: item.parentKey ? ids.modules[item.parentKey] : null,
      targetProjectId,
    }
    const existing = await tx.module.findUnique({ where: { id: data.id }, select: { parentId: true } })
    if (existing && existing.parentId !== data.parentId)
      throw new ServiceError(`Module "${item.name}" already exists with different parent ownership.`, 'CONFLICT')
    await tx.module.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name, parentId: data.parentId },
    })
    await registerProjectResourceOwnership(
      {
        targetProjectId,
        entityType: 'module',
        entityId: data.id,
        origin: 'validation-resource-proposal',
        provenance: { planId, localKey: item.localKey },
        content: data,
      },
      tx,
    )
  }
  for (const item of proposal.locatorGroups) {
    const data = {
      id: ids.locatorGroups[item.localKey],
      name: item.name,
      moduleId: ids.modules[item.moduleKey],
      route: item.route,
      targetProjectId,
    }
    await tx.locatorGroup.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name, moduleId: data.moduleId, route: data.route },
    })
    await registerProjectResourceOwnership(
      {
        targetProjectId,
        entityType: 'locator-group',
        entityId: data.id,
        origin: 'validation-resource-proposal',
        provenance: { planId, localKey: item.localKey },
        content: data,
      },
      tx,
    )
  }
  for (const item of proposal.locators) {
    const data = {
      id: ids.locators[item.localKey],
      name: item.name,
      locatorGroupId: ids.locatorGroups[item.groupKey],
      value: item.selector,
      targetProjectId,
    }
    await tx.locator.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name, locatorGroupId: data.locatorGroupId, value: data.value },
    })
    await registerProjectResourceOwnership(
      {
        targetProjectId,
        entityType: 'locator',
        entityId: data.id,
        origin: 'validation-resource-proposal',
        provenance: { planId, localKey: item.localKey },
        content: data,
      },
      tx,
    )
  }
  for (const item of proposal.environments) {
    const data = {
      id: ids.environments[item.localKey],
      name: item.name,
      baseUrl: item.baseUrl,
      apiBaseUrl: item.apiBaseUrl,
      expectedPageTitle: item.expectedPageTitle,
      targetProjectId,
    }
    await tx.environment.upsert({
      where: { id: data.id },
      create: data,
      update: {
        name: data.name,
        baseUrl: data.baseUrl,
        apiBaseUrl: data.apiBaseUrl,
        expectedPageTitle: data.expectedPageTitle,
      },
    })
    await registerProjectResourceOwnership(
      {
        targetProjectId,
        entityType: 'environment',
        entityId: data.id,
        origin: 'validation-resource-proposal',
        provenance: { planId, localKey: item.localKey },
        content: data,
      },
      tx,
    )
  }
  return ids
}

export async function proposeValidationResources(
  input: { planId: string; proposal: unknown; projectDirectory?: string },
  client: PrismaClient = prisma,
) {
  const proposal = validationResourceProposalSchema.parse(input.proposal)
  const plan = await client.planProjection.findUnique({
    where: { planId: input.planId },
    select: { lifecycle: true, targetProjectId: true },
  })
  if (!plan?.targetProjectId) throw new ServiceError('Plan must be bound to a target project.', 'CONFLICT')
  if (!['preparing_validations', 'validation_changes_requested'].includes(plan.lifecycle))
    throw new ServiceError('Validation resources can only be proposed during validation preparation.', 'CONFLICT')
  const proposalHash = hash({ targetProjectId: plan.targetProjectId, planId: input.planId, proposal })
  const result = await client.$transaction(async tx => {
    const replay = await tx.validationResourceProposal.findUnique({
      where: { planId_idempotencyKey: { planId: input.planId, idempotencyKey: proposal.idempotencyKey } },
    })
    if (replay) {
      if (replay.proposalHash !== proposalHash)
        throw new ServiceError('Idempotency key is bound to different proposal content.', 'CONFLICT')
      return { ...JSON.parse(replay.resultJson), replayed: true }
    }
    const ids = await persistProposalGraph(proposal, plan.targetProjectId!, input.planId, tx)
    const stored = {
      schemaVersion: 2,
      planId: input.planId,
      targetProjectId: plan.targetProjectId,
      proposalHash,
      ids,
      bindings: proposalBindings(proposal, ids, plan.targetProjectId!),
    }
    await tx.validationResourceProposal.create({
      data: {
        planId: input.planId,
        targetProjectId: plan.targetProjectId!,
        idempotencyKey: proposal.idempotencyKey,
        proposalHash,
        proposalJson: canonicalContractJson(proposal),
        resultJson: canonicalContractJson(stored),
      },
    })
    return { ...stored, replayed: false }
  })
  const context = await readValidationContext(input.planId, { client, projectDirectory: input.projectDirectory })
  return {
    ...result,
    contextHash: context.contextHash,
    nextRecommendedAction:
      'Use each returned locator or environment binding in the managed Validation AST, and resolve executable behavior through exact ready Step Definition references.',
  }
}

async function readProposalForMutation(planId: string, idempotencyKey: string, client: PrismaClient) {
  const proposal = await client.validationResourceProposal.findUnique({
    where: { planId_idempotencyKey: { planId, idempotencyKey } },
  })
  if (!proposal) throw new ServiceError('Validation resource proposal was not found.', 'NOT_FOUND')
  return proposal
}

async function readStoredProposalForMutation(planId: string, idempotencyKey: string, client: PrismaClient) {
  const proposal = await readProposalForMutation(planId, idempotencyKey, client)
  return { proposal, stored: JSON.parse(proposal.resultJson) as Record<string, unknown> }
}

export async function abandonValidationResourceProposal(
  input: { planId: string; idempotencyKey: string; reason: string },
  client: PrismaClient = prisma,
) {
  const { proposal, stored } = await readStoredProposalForMutation(input.planId, input.idempotencyKey, client)
  if (stored.status === 'cleaned') return stored
  const result = {
    ...stored,
    status: 'abandoned',
    abandonedAt: typeof stored.abandonedAt === 'string' ? stored.abandonedAt : new Date().toISOString(),
    abandonReason: input.reason.trim(),
  }
  await client.validationResourceProposal.update({
    where: { id: proposal.id },
    data: { resultJson: canonicalContractJson(result) },
  })
  return result
}

export async function cleanupValidationResourceProposal(
  input: { planId: string; idempotencyKey: string },
  client: PrismaClient = prisma,
) {
  const { proposal, stored } = await readStoredProposalForMutation(input.planId, input.idempotencyKey, client)
  if (stored.status === 'cleaned') return stored
  if (stored.status !== 'abandoned')
    throw new ServiceError('Abandon the validation resource proposal before cleanup.', 'CONFLICT')
  const ids = stored.ids as Record<string, Record<string, string>> | undefined
  const requested = Object.entries(ids ?? {}).flatMap(([entityType, values]) =>
    Object.values(values).map(entityId => ({
      entityType: entityType.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`).replace(/s$/, ''),
      entityId,
    })),
  )
  const ownership = await client.projectResourceOwnership.findMany({
    where: { OR: requested.map(item => ({ entityType: item.entityType, entityId: item.entityId })) },
    select: { id: true, entityType: true, entityId: true, origin: true, provenanceJson: true },
  })
  const removable = ownership.filter(item => {
    const provenance = JSON.parse(item.provenanceJson) as { planId?: string }
    return item.origin === 'validation-resource-proposal' && provenance.planId === input.planId
  })
  const removableIds = (entityType: string) =>
    removable.filter(item => item.entityType === entityType).map(item => item.entityId)
  const cleaned = await client.$transaction(async tx => {
    const deleted: Array<{ entityType: string; entityId: string }> = []
    const remove = async (entityType: string, entityIds: string[], action: () => Promise<{ count: number }>) => {
      if (!entityIds.length) return
      const result = await action()
      if (result.count) deleted.push(...entityIds.map(entityId => ({ entityType, entityId })))
    }
    await remove('locator', removableIds('locator'), () =>
      tx.locator.deleteMany({ where: { id: { in: removableIds('locator') } } }),
    )
    await remove('locator-group', removableIds('locator-group'), () =>
      tx.locatorGroup.deleteMany({ where: { id: { in: removableIds('locator-group') }, locators: { none: {} } } }),
    )
    await remove('environment', removableIds('environment'), () =>
      tx.environment.deleteMany({ where: { id: { in: removableIds('environment') }, testRuns: { none: {} } } }),
    )
    const moduleIds = removableIds('module')
    for (const moduleId of moduleIds.reverse()) {
      await remove('module', [moduleId], () =>
        tx.module.deleteMany({
          where: { id: moduleId, children: { none: {} }, locatorGroups: { none: {} }, testSuites: { none: {} } },
        }),
      )
    }
    await tx.projectResourceOwnership.deleteMany({
      where: { OR: deleted.map(item => ({ entityType: item.entityType, entityId: item.entityId })) },
    })
    return deleted
  })
  const cleanedKeys = new Set(cleaned.map(item => `${item.entityType}:${item.entityId}`))
  const result = {
    ...stored,
    status: 'cleaned',
    cleanedAt: new Date().toISOString(),
    cleaned,
    retained: requested.filter(item => !cleanedKeys.has(`${item.entityType}:${item.entityId}`)),
  }
  await client.validationResourceProposal.update({
    where: { id: proposal.id },
    data: { resultJson: canonicalContractJson(result) },
  })
  return result
}
