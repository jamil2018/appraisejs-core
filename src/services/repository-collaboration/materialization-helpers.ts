import { randomUUID } from 'node:crypto'

import type { CollaborationEntityKind, Prisma } from '@prisma/client'

import { canonicalJson, collaborationHash, recordKey, type CollaborationRecord } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'
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
  localIdFor: LocalIdFor
  entityMapIdFor: (record: Pick<CollaborationRecord, 'kind' | 'portableId'>) => string
  assertNoCollision: CollisionCheck
}

function stepReferences(records: CollaborationRecord[]) {
  const references = new Map<string, string>()
  for (const record of records) {
    if (record.archived || (record.kind !== 'test-case' && record.kind !== 'template')) continue
    for (const step of record.payload.steps) {
      references.set(`${step.invocation.step.id}@${step.invocation.step.version}`, step.invocation.step.definitionHash)
    }
  }
  return references
}

async function validateStepReference(transaction: Transaction, reference: string, expectedHash: string) {
  const separator = reference.lastIndexOf('@')
  const id = reference.slice(0, separator)
  const version = reference.slice(separator + 1)
  const definition = await transaction.stepDefinition.findUnique({ where: { id_version: { id, version } } })
  if (!definition || definition.status !== 'ready') {
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
    const id = context.localIdFor(record)
    const existing = await context.transaction.module.findUnique({ where: { id } })
    if (record.archived) {
      if (existing) {
        await context.transaction.module.update({
          where: { id },
          data: { archivedAt: context.now, collaborationManaged: true, archiveVersion: { increment: 1 } },
        })
      }
    } else {
      await context.assertNoCollision(record, {
        targetProjectId: context.binding.targetProjectId,
        name: record.payload.name,
      })
      const data = {
        name: record.payload.name,
        parentId: record.payload.parentPortableId
          ? context.localIdFor({ kind: 'module', portableId: record.payload.parentPortableId })
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
  const id = context.localIdFor(record)
  const existing = await context.transaction.tag.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.tag.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    name: record.payload.name,
    type: record.payload.type,
  })
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
  const id = context.localIdFor(record)
  const existing = await context.transaction.locatorGroup.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.locatorGroup.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    name: record.payload.name,
  })
  const data = {
    name: record.payload.name,
    route: record.payload.route,
    moduleId: context.localIdFor({ kind: 'module', portableId: record.payload.modulePortableId }),
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
  const id = context.localIdFor(record)
  const existing = await context.transaction.locator.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.locator.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    name: record.payload.name,
  })
  const data = {
    name: record.payload.name,
    value: record.payload.value,
    locatorGroupId: context.localIdFor({ kind: 'locator-group', portableId: record.payload.locatorGroupPortableId }),
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
  const id = context.localIdFor(record)
  const existing = await context.transaction.testCase.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.testCase.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    title: record.payload.title,
  })
  const data = {
    title: record.payload.title,
    description: record.payload.description,
    archivedAt: null,
    collaborationManaged: true,
    tags: {
      set: record.payload.tagPortableIds.map(portableId => ({ id: context.localIdFor({ kind: 'tag', portableId }) })),
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
    data: record.payload.steps.map(step => ({
      id: randomUUID(),
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
  const createdSteps = await context.transaction.testCaseStep.findMany({ where: { testCaseId: id } })
  const stepIdByPortableId = new Map(createdSteps.map(step => [step.collaborationPortableId!, step.id]))
  for (const step of record.payload.steps) {
    await context.transaction.testCaseStepParameter.createMany({
      data: step.parameters.map(parameter => ({
        testCaseStepId: stepIdByPortableId.get(step.portableId)!,
        name: parameter.name,
        value: parameter.value,
        type: parameter.type,
        order: parameter.order,
        locatorId: parameter.locatorPortableId
          ? context.localIdFor({ kind: 'locator', portableId: parameter.locatorPortableId })
          : null,
      })),
    })
  }
  for (const block of record.payload.flowBlocks) {
    await context.transaction.testCaseFlowBlock.create({
      data: {
        id: randomUUID(),
        testCaseId: id,
        collaborationPortableId: block.portableId,
        name: block.name,
        order: block.order,
        nodes: { create: block.flowNodeIds.map(flowNodeId => ({ flowNodeId })) },
      },
    })
  }
}

async function materializeTemplate(context: MaterializationContext, record: RecordWithKind<'template'>) {
  const id = context.localIdFor(record)
  const existing = await context.transaction.templateTestCase.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.templateTestCase.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    name: record.payload.name,
  })
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
    data: record.payload.steps.map(step => ({
      id: randomUUID(),
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
  const createdSteps = await context.transaction.templateTestCaseStep.findMany({ where: { templateTestCaseId: id } })
  const stepIdByPortableId = new Map(createdSteps.map(step => [step.collaborationPortableId!, step.id]))
  for (const step of record.payload.steps) {
    await context.transaction.templateTestCaseStepParameter.createMany({
      data: step.parameters.map(parameter => ({
        testCaseStepId: stepIdByPortableId.get(step.portableId)!,
        name: parameter.name,
        defaultValue: parameter.value,
        type: parameter.type,
        order: parameter.order,
        defaultLocatorId: parameter.locatorPortableId
          ? context.localIdFor({ kind: 'locator', portableId: parameter.locatorPortableId })
          : null,
      })),
    })
  }
  for (const block of record.payload.flowBlocks) {
    await context.transaction.templateTestCaseFlowBlock.create({
      data: {
        id: randomUUID(),
        templateTestCaseId: id,
        collaborationPortableId: block.portableId,
        name: block.name,
        order: block.order,
        nodes: { create: block.flowNodeIds.map(flowNodeId => ({ flowNodeId })) },
      },
    })
  }
}

async function materializeSuite(context: MaterializationContext, record: RecordWithKind<'test-suite'>) {
  const id = context.localIdFor(record)
  const existing = await context.transaction.testSuite.findUnique({ where: { id } })
  if (
    await archiveIfRequested(record, existing, () =>
      context.transaction.testSuite.update({
        where: { id },
        data: { archivedAt: context.now, archiveVersion: { increment: 1 } },
      }),
    )
  )
    return
  await context.assertNoCollision(record, {
    targetProjectId: context.binding.targetProjectId,
    name: record.payload.name,
  })
  const data = {
    name: record.payload.name,
    description: record.payload.description,
    moduleId: context.localIdFor({ kind: 'module', portableId: record.payload.modulePortableId }),
    archivedAt: null,
    collaborationManaged: true,
    testCases: {
      set: record.payload.testCasePortableIds.map(portableId => ({
        id: context.localIdFor({ kind: 'test-case', portableId }),
      })),
    },
    tags: {
      set: record.payload.tagPortableIds.map(portableId => ({ id: context.localIdFor({ kind: 'tag', portableId }) })),
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
  const mapping = await context.transaction.collaborationEnvironmentMapping.findUnique({
    where: { bindingId_portableId: { bindingId: context.binding.id, portableId: record.portableId } },
  })
  if (!mapping) {
    throw new ServiceError(`Environment ${record.portableId} requires an explicit local mapping.`, 'CONFLICT', 409)
  }
  const environment = await context.transaction.environment.findFirst({
    where: { id: mapping.localEnvironmentId, targetProjectId: context.binding.targetProjectId, archivedAt: null },
  })
  if (!environment || environment.scopeVersion !== mapping.localScopeVersion) {
    throw new ServiceError(`Environment mapping ${record.portableId} is stale.`, 'CONFLICT', 409)
  }
  await context.transaction.collaborationEntityMap.update({
    where: { id: context.entityMapIdFor(record) },
    data: { localEntityId: environment.id },
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
    else await materializeJourneyReuseAsset(context, record)
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
