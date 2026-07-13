import { createHash } from 'node:crypto'
import { TemplateStepIcon, TemplateStepType, type Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { registerProjectResourceOwnership } from '@/services/project-resource/project-resource-ownership-service'
import { ServiceError } from '@/services/shared/errors'
import { readValidationContext } from './validation-authoring-context-service'

const key = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const text = z.string().min(1).max(500)
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const stableId = (targetProjectId: string, entityType: string, localKey: string) =>
  `apr-${createHash('sha256').update(`${targetProjectId}:${entityType}:${localKey}`).digest('hex').slice(0, 24)}`

function proposalBindings(
  proposal: Proposal,
  ids: Awaited<ReturnType<typeof persistProposalGraph>>,
  targetProjectId: string,
) {
  return {
    locatorGroups: proposal.locatorGroups.map(item => ({
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

const validationResourceProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    idempotencyKey: key,
    modules: z
      .array(z.object({ localKey: key, name: text, parentKey: key.optional() }))
      .max(50)
      .default([]),
    locatorGroups: z
      .array(z.object({ localKey: key, name: text, moduleKey: key, route: z.string().min(1).max(500) }))
      .max(50)
      .default([]),
    locators: z
      .array(z.object({ localKey: key, name: text, groupKey: key, selector: text }))
      .max(200)
      .default([]),
    environments: z
      .array(
        z.object({
          localKey: key,
          name: text,
          baseUrl: z.string().url(),
          apiBaseUrl: z.string().url().optional(),
        }),
      )
      .max(20)
      .default([]),
    templateSteps: z
      .array(z.object({ localKey: key, name: text, signature: text, groupId: z.string().min(1) }))
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((proposal, context) => {
    for (const [field, values] of Object.entries(proposal).filter(([, value]) => Array.isArray(value)) as Array<
      [string, Array<{ localKey: string }>]
    >) {
      const duplicates = values.filter(
        (value, index) => values.findIndex(item => item.localKey === value.localKey) !== index,
      )
      if (duplicates.length)
        context.addIssue({ code: 'custom', path: [field], message: `Duplicate ${field} localKey.` })
    }
    const moduleKeys = new Set(proposal.modules.map(item => item.localKey))
    const groupKeys = new Set(proposal.locatorGroups.map(item => item.localKey))
    proposal.modules.forEach((item, index) => {
      if (item.parentKey && !moduleKeys.has(item.parentKey))
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'parentKey'],
          message: 'Unknown module parentKey.',
        })
    })
    proposal.locatorGroups.forEach((item, index) => {
      if (!moduleKeys.has(item.moduleKey))
        context.addIssue({ code: 'custom', path: ['locatorGroups', index, 'moduleKey'], message: 'Unknown moduleKey.' })
    })
    proposal.locators.forEach((item, index) => {
      if (!groupKeys.has(item.groupKey))
        context.addIssue({ code: 'custom', path: ['locators', index, 'groupKey'], message: 'Unknown groupKey.' })
    })
  })

type Proposal = z.infer<typeof validationResourceProposalSchema>
type Transaction = Prisma.TransactionClient

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
    templateSteps: Object.fromEntries(
      proposal.templateSteps.map(item => [item.localKey, stableId(targetProjectId, 'template-step', item.localKey)]),
    ),
  }
  for (const item of proposal.modules) {
    const data = {
      id: ids.modules[item.localKey],
      name: item.name,
      parentId: item.parentKey ? ids.modules[item.parentKey] : null,
      targetProjectId,
    }
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
      targetProjectId,
    }
    await tx.environment.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name, baseUrl: data.baseUrl, apiBaseUrl: data.apiBaseUrl },
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
  for (const item of proposal.templateSteps) {
    const group = await tx.templateStepGroup.findUnique({
      where: { id: item.groupId },
      select: { id: true },
    })
    if (!group) throw new ServiceError(`Template step group "${item.groupId}" was not found.`, 'CONFLICT')
    const data = {
      id: ids.templateSteps[item.localKey],
      name: item.name,
      signature: item.signature,
      templateStepGroupId: item.groupId,
    }
    await tx.templateStep.upsert({
      where: { id: data.id },
      create: { ...data, type: TemplateStepType.ACTION, icon: TemplateStepIcon.DEBUG },
      update: { name: data.name, signature: data.signature, templateStepGroupId: data.templateStepGroupId },
    })
    await registerProjectResourceOwnership(
      {
        targetProjectId,
        entityType: 'template-step',
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
      schemaVersion: 1,
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
    nextRecommendedAction: 'Use the returned stable IDs and refreshed context to author the managed Validation AST.',
  }
}
