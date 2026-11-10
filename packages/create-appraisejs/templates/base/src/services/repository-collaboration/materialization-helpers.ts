import type { CollaborationEntityKind, Prisma } from '@prisma/client'

import { canonicalJson, collaborationHash, recordKey, type CollaborationRecord } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'
import type { MaterializationPlan } from './materialization-plan'
import {
  canonicalStepDefinitionJson,
  computeStepReferenceHash,
  stepDefinitionSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

export const entityKindByRecordKind: Record<CollaborationRecord['kind'], CollaborationEntityKind> = {
  module: 'MODULE',
  'test-suite': 'TEST_SUITE',
  'test-case': 'TEST_CASE',
  template: 'TEMPLATE',
  'locator-group': 'LOCATOR_GROUP',
  locator: 'LOCATOR',
  tag: 'TAG',
  'environment-reference': 'ENVIRONMENT_REFERENCE',
  'journey-reuse-asset': 'JOURNEY_REUSE_ASSET',
}

type Transaction = Prisma.TransactionClient
type RecordWithKind<K extends CollaborationRecord['kind']> = Extract<CollaborationRecord, { kind: K }>
type LocalIdFor = (record: Pick<CollaborationRecord, 'kind' | 'portableId'>) => string
type CollisionCheck = (record: CollaborationRecord, where: Record<string, unknown>) => Promise<void>

export interface MaterializationContext {
  transaction: Transaction
  binding: { id: string; targetProjectId: string }
  now: Date
  repositoryRevision?: string
  plan: MaterializationPlan
}

function plannedLocalId(context: MaterializationContext, record: Pick<CollaborationRecord, 'kind' | 'portableId'>) {
  const id = context.plan.localIdByKey.get(recordKey(record))
  if (!id) throw new ServiceError(`Missing local identity for ${recordKey(record)}.`, 'INTERNAL', 500)
  return id
}
function plannedMapId(context: MaterializationContext, record: Pick<CollaborationRecord, 'kind' | 'portableId'>) {
  const id = context.plan.entityMapIdByKey.get(recordKey(record))
  if (!id) throw new ServiceError(`Missing collaboration map for ${recordKey(record)}.`, 'INTERNAL', 500)
  return id
}
function plannedChildren(context: MaterializationContext, record: CollaborationRecord) {
  const children = context.plan.childrenByKey.get(recordKey(record))
  if (!children) throw new ServiceError(`Missing prepared children for ${recordKey(record)}.`, 'INTERNAL', 500)
  return children
}

function stepReferences(records: CollaborationRecord[]) {
  const references = new Map<string, string>()
  for (const record of records) {
    if (record.archived || (record.kind !== 'test-case' && record.kind !== 'template')) continue
    for (const step of record.payload.steps) {
      const reference = `${step.invocation.step.id}@${step.invocation.step.version}`
      const previous = references.get(reference)
      if (previous && previous !== step.invocation.step.definitionHash)
        throw new ServiceError(`Required Step Definition ${reference} has conflicting shared hashes.`, 'CONFLICT', 409)
      references.set(reference, step.invocation.step.definitionHash)
    }
  }
  return references
}

async function validateStepReference(transaction: Transaction, reference: string, expectedHash: string) {
  const separator = reference.lastIndexOf('@')
  const id = reference.slice(0, separator)
  const version = reference.slice(separator + 1)
  const definition = await transaction.stepDefinition.findUnique({ where: { id_version: { id, version } },
    select: { id: true, version: true, status: true, definitionJson: true } })
  if (!definition || definition.id !== id || definition.version !== version || definition.status !== 'ready') {
    throw new ServiceError(`Required Step Definition ${reference} is not ready locally.`, 'CONFLICT', 409)
  }
  const actualHash = computeStepReferenceHash(
    stepDefinitionSchema.parse(JSON.parse(definition.definitionJson) as unknown),
  )
  if (actualHash !== expectedHash) {
    throw new ServiceError(`Required Step Definition ${reference} does not match the shared hash.`, 'CONFLICT', 409)
  }
}

export async function validateExactSteps(transaction: Transaction, records: CollaborationRecord[]) {
  for (const [reference, expectedHash] of stepReferences(records)) {
    await validateStepReference(transaction, reference, expectedHash)
  }
}

type CollisionLookup = (transaction: Transaction, where: Record<string, unknown>) => Promise<{ id: string } | null>

const collisionLookupByKind: Partial<Record<CollaborationRecord['kind'], CollisionLookup>> = {
  module: (transaction, where) =>
    transaction.module.findFirst({ where: where as Prisma.ModuleWhereInput, select: { id: true } }),
  'test-suite': (transaction, where) =>
    transaction.testSuite.findFirst({ where: where as Prisma.TestSuiteWhereInput, select: { id: true } }),
  'test-case': (transaction, where) =>
    transaction.testCase.findFirst({ where: where as Prisma.TestCaseWhereInput, select: { id: true } }),
  template: (transaction, where) =>
    transaction.templateTestCase.findFirst({ where: where as Prisma.TemplateTestCaseWhereInput, select: { id: true } }),
  'locator-group': (transaction, where) =>
    transaction.locatorGroup.findFirst({ where: where as Prisma.LocatorGroupWhereInput, select: { id: true } }),
  locator: (transaction, where) =>
    transaction.locator.findFirst({ where: where as Prisma.LocatorWhereInput, select: { id: true } }),
  tag: (transaction, where) =>
    transaction.tag.findFirst({ where: where as Prisma.TagWhereInput, select: { id: true } }),
}

export function createCollisionChecker(
  transaction: Transaction,
  adoptedLocalIds: Map<string, string> | undefined,
  localIdFor: LocalIdFor,
): CollisionCheck {
  return async (record, where) => {
    if (adoptedLocalIds?.has(recordKey(record))) return
    const lookup = collisionLookupByKind[record.kind]
    const existing = lookup ? await lookup(transaction, where) : null
    if (existing && existing.id !== localIdFor(record)) {
      throw new ServiceError(`First adoption review is required for ${recordKey(record)}.`, 'CONFLICT', 409)
    }
  }
}

async function archiveIfRequested(
  record: CollaborationRecord,
  existing: { id: string } | null,
  archive: () => Promise<unknown>,
) {
  if (!record.archived) return false
  if (existing) await archive()
  return true
}

async function materializeModules(context: MaterializationContext, records: RecordWithKind<'module'>[]) {
  const moduleById = new Map(records.map(record => [record.portableId, record]))
  const completed = new Set<string>()
  const materialize = async (record: RecordWithKind<'module'>): Promise<void> => {
    if (completed.has(record.portableId)) return
    if (record.payload.parentPortableId) await materialize(moduleById.get(record.payload.parentPortableId)!)
    const id = plannedLocalId(context, record)
    const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
    if (record.archived) {
      if (existing) {
        await context.transaction.module.update({
          where: { id },
          data: { archivedAt: context.now, collaborationManaged: true, archiveVersion: { increment: 1 } },
        })
      }
    } else {
      const data = {
        name: record.payload.name,
        parentId: record.payload.parentPortableId
          ? plannedLocalId(context, { kind: 'module', portableId: record.payload.parentPortableId })
          : null,
        archivedAt: null,
        collaborationManaged: true,
      }
      if (existing) {
        await context.transaction.module.update({
          where: { id },
          data: { ...data, archiveVersion: existing.archivedAt ? { increment: 1 } : undefined },
        })
      } else {
        await context.transaction.module.create({
          data: { id, targetProjectId: context.binding.targetProjectId, ...data },
        })
      }
    }
    completed.add(record.portableId)
  }
  for (const record of records) await materialize(record)
}

async function materializeTag(context: MaterializationContext, record: RecordWithKind<'tag'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.tag.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    name: record.payload.name,
    tagExpression: record.payload.expression,
    type: record.payload.type,
    archivedAt: null,
    collaborationManaged: true,
  }
  if (existing) await context.transaction.tag.update({ where: { id }, data })
  else await context.transaction.tag.create({ data: { id, targetProjectId: context.binding.targetProjectId, ...data } })
}

async function materializeLocatorGroup(context: MaterializationContext, record: RecordWithKind<'locator-group'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.locatorGroup.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    name: record.payload.name,
    route: record.payload.route,
    moduleId: plannedLocalId(context, { kind: 'module', portableId: record.payload.modulePortableId }),
    archivedAt: null,
    collaborationManaged: true,
  }
  if (existing) await context.transaction.locatorGroup.update({ where: { id }, data })
  else
    await context.transaction.locatorGroup.create({
      data: { id, targetProjectId: context.binding.targetProjectId, ...data },
    })
}

async function materializeLocator(context: MaterializationContext, record: RecordWithKind<'locator'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.locator.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    name: record.payload.name,
    value: record.payload.value,
    locatorGroupId: plannedLocalId(context, { kind: 'locator-group', portableId: record.payload.locatorGroupPortableId }),
    archivedAt: null,
    collaborationManaged: true,
  }
  if (existing) await context.transaction.locator.update({ where: { id }, data })
  else
    await context.transaction.locator.create({
      data: { id, targetProjectId: context.binding.targetProjectId, ...data },
    })
}

async function materializeTestCase(context: MaterializationContext, record: RecordWithKind<'test-case'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.testCase.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    title: record.payload.title,
    description: record.payload.description,
    archivedAt: null,
    collaborationManaged: true,
    tags: {
      set: record.payload.tagPortableIds.map(portableId => ({ id: plannedLocalId(context, { kind: 'tag', portableId }) })),
    },
  }
  if (existing) {
    await context.transaction.testCaseFlowBlock.deleteMany({ where: { testCaseId: id } })
    await context.transaction.testCaseStep.deleteMany({ where: { testCaseId: id } })
    await context.transaction.testCase.update({ where: { id }, data })
  } else {
    await context.transaction.testCase.create({
      data: {
        id,
        targetProjectId: context.binding.targetProjectId,
        title: data.title,
        description: data.description,
        archivedAt: data.archivedAt,
        collaborationManaged: data.collaborationManaged,
      },
    })
    await context.transaction.testCase.update({ where: { id }, data: { tags: data.tags } })
  }
  await context.transaction.testCaseStep.createMany({
    data: record.payload.steps.map((step, index) => ({
      id: plannedChildren(context, record).steps[index],
      testCaseId: id,
      collaborationPortableId: step.portableId,
      flowNodeId: step.flowNodeId,
      order: step.order,
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      label: step.label,
      invocationJson: canonicalStepDefinitionJson(step.invocation),
    })),
  })
  const stepIdByPortableId = new Map(record.payload.steps.map((step, index) =>
    [step.portableId, plannedChildren(context, record).steps[index]]))
  for (const [stepIndex, step] of record.payload.steps.entries()) {
    await context.transaction.testCaseStepParameter.createMany({
      data: step.parameters.map((parameter, parameterIndex) => ({
        id: plannedChildren(context, record).parameters[stepIndex][parameterIndex],
        testCaseStepId: stepIdByPortableId.get(step.portableId)!,
        name: parameter.name,
        value: parameter.value,
        type: parameter.type,
        order: parameter.order,
        locatorId: parameter.locatorPortableId
          ? plannedLocalId(context, { kind: 'locator', portableId: parameter.locatorPortableId })
          : null,
      })),
    })
  }
  for (const [blockIndex, block] of record.payload.flowBlocks.entries()) {
    await context.transaction.testCaseFlowBlock.create({
      data: {
        id: plannedChildren(context, record).blocks[blockIndex],
        testCaseId: id,
        collaborationPortableId: block.portableId,
        name: block.name,
        order: block.order,
        nodes: { create: block.flowNodeIds.map((flowNodeId, nodeIndex) => ({
          id: plannedChildren(context, record).nodes[blockIndex][nodeIndex], flowNodeId,
        })) },
      },
    })
  }
}

async function materializeTemplate(context: MaterializationContext, record: RecordWithKind<'template'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.templateTestCase.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    name: record.payload.name,
    description: record.payload.description,
    archivedAt: null,
    collaborationManaged: true,
  }
  if (existing) {
    await context.transaction.templateTestCaseFlowBlock.deleteMany({ where: { templateTestCaseId: id } })
    await context.transaction.templateTestCaseStep.deleteMany({ where: { templateTestCaseId: id } })
    await context.transaction.templateTestCase.update({ where: { id }, data })
  } else {
    await context.transaction.templateTestCase.create({
      data: { id, targetProjectId: context.binding.targetProjectId, ...data },
    })
  }
  await context.transaction.templateTestCaseStep.createMany({
    data: record.payload.steps.map((step, index) => ({
      id: plannedChildren(context, record).steps[index],
      templateTestCaseId: id,
      collaborationPortableId: step.portableId,
      flowNodeId: step.flowNodeId,
      order: step.order,
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      label: step.label,
      invocationJson: canonicalStepDefinitionJson(step.invocation),
    })),
  })
  const stepIdByPortableId = new Map(record.payload.steps.map((step, index) =>
    [step.portableId, plannedChildren(context, record).steps[index]]))
  for (const [stepIndex, step] of record.payload.steps.entries()) {
    await context.transaction.templateTestCaseStepParameter.createMany({
      data: step.parameters.map((parameter, parameterIndex) => ({
        id: plannedChildren(context, record).parameters[stepIndex][parameterIndex],
        testCaseStepId: stepIdByPortableId.get(step.portableId)!,
        name: parameter.name,
        defaultValue: parameter.value,
        type: parameter.type,
        order: parameter.order,
        defaultLocatorId: parameter.locatorPortableId
          ? plannedLocalId(context, { kind: 'locator', portableId: parameter.locatorPortableId })
          : null,
      })),
    })
  }
  for (const [blockIndex, block] of record.payload.flowBlocks.entries()) {
    await context.transaction.templateTestCaseFlowBlock.create({
      data: {
        id: plannedChildren(context, record).blocks[blockIndex],
        templateTestCaseId: id,
        collaborationPortableId: block.portableId,
        name: block.name,
        order: block.order,
        nodes: { create: block.flowNodeIds.map((flowNodeId, nodeIndex) => ({
          id: plannedChildren(context, record).nodes[blockIndex][nodeIndex], flowNodeId,
        })) },
      },
    })
  }
}

async function materializeSuite(context: MaterializationContext, record: RecordWithKind<'test-suite'>) {
  const id = plannedLocalId(context, record)
  const existing = context.plan.existingByKey.get(recordKey(record)) ?? null
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.testSuite.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  const data = {
    name: record.payload.name,
    description: record.payload.description,
    moduleId: plannedLocalId(context, { kind: 'module', portableId: record.payload.modulePortableId }),
    archivedAt: null,
    collaborationManaged: true,
    testCases: {
      set: record.payload.testCasePortableIds.map(portableId => ({
        id: plannedLocalId(context, { kind: 'test-case', portableId }),
      })),
    },
    tags: {
      set: record.payload.tagPortableIds.map(portableId => ({ id: plannedLocalId(context, { kind: 'tag', portableId }) })),
    },
  }
  if (existing) await context.transaction.testSuite.update({ where: { id }, data })
  else {
    await context.transaction.testSuite.create({
      data: {
        id,
        targetProjectId: context.binding.targetProjectId,
        name: data.name,
        description: data.description,
        moduleId: data.moduleId,
        archivedAt: data.archivedAt,
        collaborationManaged: data.collaborationManaged,
      },
    })
    await context.transaction.testSuite.update({ where: { id }, data: { testCases: data.testCases, tags: data.tags } })
  }
}

async function materializeEnvironmentReference(
  context: MaterializationContext,
  record: RecordWithKind<'environment-reference'>,
) {
  if (record.archived) return
  const environmentId = context.plan.environmentIdByKey.get(recordKey(record))
  if (!environmentId) throw new ServiceError(`Missing prepared environment ${record.portableId}.`, 'INTERNAL', 500)
  await context.transaction.collaborationEntityMap.update({
    where: { id: plannedMapId(context, record) },
    data: { localEntityId: environmentId },
  })
}

async function materializeJourneyReuseAsset(
  context: MaterializationContext,
  record: RecordWithKind<'journey-reuse-asset'>,
) {
  if (record.archived) return
  await context.transaction.collaborationReuseAsset.upsert({
    where: {
      bindingId_portableId_sourceVersion: {
        bindingId: context.binding.id,
        portableId: record.portableId,
        sourceVersion: record.version,
      },
    },
    create: {
      bindingId: context.binding.id,
      portableId: record.portableId,
      sourceVersion: record.version,
      kind: record.payload.assetKind,
      payloadJson: canonicalJson(record.payload),
      payloadHash: collaborationHash(record.payload),
      sourceRevision: context.repositoryRevision,
    },
    update: {},
  })
}

export async function materializeRecords(context: MaterializationContext, records: CollaborationRecord[]) {
  const modules = records.filter((record): record is RecordWithKind<'module'> => record.kind === 'module')
  await materializeModules(context, modules)
  for (const record of records) {
    if (record.kind === 'module') continue
    if (record.kind === 'tag') await materializeTag(context, record)
    else if (record.kind === 'locator-group') await materializeLocatorGroup(context, record)
    else if (record.kind === 'locator') await materializeLocator(context, record)
    else if (record.kind === 'test-case') await materializeTestCase(context, record)
    else if (record.kind === 'template') await materializeTemplate(context, record)
    else if (record.kind === 'test-suite') await materializeSuite(context, record)
    else if (record.kind === 'environment-reference') await materializeEnvironmentReference(context, record)
    else if (record.kind === 'journey-reuse-asset') await materializeJourneyReuseAsset(context, record)
    else throw new ServiceError('Unsupported collaboration record kind.', 'CONFLICT', 409)
  }
}

export async function persistMaterializationBaselines(
  transaction: Transaction,
  records: CollaborationRecord[],
  entityMapIdByKey: Map<string, string>,
  keyFor: (record: Pick<CollaborationRecord, 'kind' | 'portableId'>) => string,
  now: Date,
  repositoryRevision?: string,
) {
  for (const record of records) {
    const mapId = entityMapIdByKey.get(keyFor(record))!
    const payloadJson = canonicalJson(record)
    const payloadHash = collaborationHash(record)
    await transaction.collaborationEntityMap.update({
      where: { id: mapId },
      data: { currentHash: payloadHash, archivedAt: record.archived ? now : null },
    })
    await transaction.collaborationBaseline.upsert({
      where: { entityMapId: mapId },
      create: { entityMapId: mapId, payloadJson, payloadHash, repositoryRevision },
      update: { payloadJson, payloadHash, repositoryRevision, acknowledgedAt: now },
    })
  }
}
