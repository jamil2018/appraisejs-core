import type { CollaborationEntityKind, Prisma } from '@prisma/client'

import {
  buildCollaborationSnapshotFiles,
  newPortableId,
  type CollaborationRecord,
  type CollaborationSnapshotFiles,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const entityKindByRecordKind: Record<CollaborationRecord['kind'], CollaborationEntityKind> = {
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

const portablePrefixByKind: Record<CollaborationRecord['kind'], string> = {
  module: 'module',
  'test-suite': 'suite',
  'test-case': 'case',
  template: 'template',
  'locator-group': 'locator-group',
  locator: 'locator',
  tag: 'tag',
  'environment-reference': 'environment',
  'journey-reuse-asset': 'reuse',
}

type Transaction = Prisma.TransactionClient
type Portable = (kind: CollaborationRecord['kind'], localId: string) => string
type ScenarioStepPayload = Extract<CollaborationRecord, { kind: 'test-case' }>['payload']['steps'][number]
type ScenarioParameterPayload = ScenarioStepPayload['parameters'][number]

async function portableIdFor(
  transaction: Transaction,
  bindingId: string,
  kind: CollaborationRecord['kind'],
  localEntityId: string,
): Promise<string> {
  const prismaKind = entityKindByRecordKind[kind]
  const existing = await transaction.collaborationEntityMap.findFirst({
    where: { bindingId, kind: prismaKind, localEntityId },
  })
  if (existing) return existing.portableId
  const portableId = newPortableId(portablePrefixByKind[kind])
  await transaction.collaborationEntityMap.create({ data: { bindingId, kind: prismaKind, portableId, localEntityId } })
  return portableId
}

async function ensureStepPortableId(
  transaction: Transaction,
  table: 'testCaseStep' | 'templateTestCaseStep' | 'testCaseFlowBlock' | 'templateTestCaseFlowBlock',
  id: string,
  current: string | null,
  prefix: string,
): Promise<string> {
  if (current) return current
  const portableId = newPortableId(prefix)
  const data = { collaborationPortableId: portableId }
  if (table === 'testCaseStep') await transaction.testCaseStep.update({ where: { id }, data })
  else if (table === 'templateTestCaseStep') await transaction.templateTestCaseStep.update({ where: { id }, data })
  else if (table === 'testCaseFlowBlock') await transaction.testCaseFlowBlock.update({ where: { id }, data })
  else await transaction.templateTestCaseFlowBlock.update({ where: { id }, data })
  return portableId
}

function invocationProjection(invocationJson: string) {
  return stepInvocationSchema.parse(JSON.parse(invocationJson) as unknown)
}

function keywordFor(gherkinStep: string): 'Given' | 'When' | 'Then' | 'And' {
  const keyword = gherkinStep.trim().split(/\s+/, 1)[0]
  return keyword === 'Given' || keyword === 'When' || keyword === 'Then' || keyword === 'And' ? keyword : 'And'
}

async function loadProjectionEntities(transaction: Transaction, targetProjectId: string) {
  const [modules, tags, locatorGroups, locators, testCases, templates, suites, environments] = await Promise.all([
    transaction.module.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    transaction.tag.findMany({ where: { targetProjectId, type: 'FILTER' }, orderBy: { id: 'asc' } }),
    transaction.locatorGroup.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    transaction.locator.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    transaction.testCase.findMany({
      where: { targetProjectId },
      include: {
        tags: true,
        steps: { include: { parameters: true }, orderBy: { order: 'asc' } },
        flowBlocks: { include: { nodes: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    transaction.templateTestCase.findMany({
      where: { targetProjectId },
      include: {
        steps: { include: { parameters: true }, orderBy: { order: 'asc' } },
        flowBlocks: { include: { nodes: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    transaction.testSuite.findMany({
      where: { targetProjectId },
      include: { testCases: true, tags: true },
      orderBy: { id: 'asc' },
    }),
    transaction.environment.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
  ])
  return { modules, tags, locatorGroups, locators, testCases, templates, suites, environments }
}

async function assignPortableIds(
  transaction: Transaction,
  bindingId: string,
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
) {
  const portableByLocalId = new Map<string, string>()
  const localKey = (kind: CollaborationRecord['kind'], localId: string) => `${kind}:${localId}`
  const mapEntities = async (kind: CollaborationRecord['kind'], items: Array<{ id: string }>) => {
    for (const item of items) {
      portableByLocalId.set(localKey(kind, item.id), await portableIdFor(transaction, bindingId, kind, item.id))
    }
  }
  await mapEntities('module', entities.modules)
  await mapEntities('tag', entities.tags)
  await mapEntities('locator-group', entities.locatorGroups)
  await mapEntities('locator', entities.locators)
  await mapEntities('test-case', entities.testCases)
  await mapEntities('template', entities.templates)
  await mapEntities('test-suite', entities.suites)
  await mapEntities('environment-reference', entities.environments)
  return (kind: CollaborationRecord['kind'], localId: string) => {
    const value = portableByLocalId.get(localKey(kind, localId))
    if (!value) throw new ServiceError(`Missing collaboration identity for ${localId}.`, 'INTERNAL', 500)
    return value
  }
}

function commonRecord(portableProjectId: string, portableId: string, archivedAt: Date | null) {
  return {
    format: 'appraise.repository-collaboration/v1' as const,
    portableProjectId,
    portableId,
    version: 1,
    archived: archivedAt !== null,
  }
}

function filterTagPortableIds(tags: { id: string; type: string }[], portable: Portable) {
  return tags.filter(tag => tag.type === 'FILTER').map(tag => portable('tag', tag.id))
}

type ProjectableParameter = {
  name: string
  value?: ScenarioParameterPayload['value']
  defaultValue?: ScenarioParameterPayload['value']
  type: ScenarioParameterPayload['type']
  order: number
  locatorId?: string | null
  defaultLocatorId?: string | null
}
type ProjectableStep = {
  id: string
  collaborationPortableId: string | null
  flowNodeId: string | null
  order: number
  gherkinStep: string
  icon: ScenarioStepPayload['icon']
  label: string | null
  invocationJson: string
  parameters: ProjectableParameter[]
}
type ProjectableFlowBlock = {
  id: string
  collaborationPortableId: string | null
  name: string
  order: number
  nodes: { flowNodeId: string }[]
}

async function projectScenarioContent(
  transaction: Transaction,
  stepsInput: ProjectableStep[],
  blocksInput: ProjectableFlowBlock[],
  portable: Portable,
  config: {
    stepTable: 'testCaseStep' | 'templateTestCaseStep'
    blockTable: 'testCaseFlowBlock' | 'templateTestCaseFlowBlock'
    stepPrefix: string
    blockPrefix: string
    parameterValue: (parameter: ProjectableParameter) => ScenarioParameterPayload['value']
    parameterLocatorId: (parameter: ProjectableParameter) => string | null
  },
) {
  const steps: ScenarioStepPayload[] = []
  const flowPortableByLocal = new Map<string, string>()
  for (const step of stepsInput) {
    const portableId = await ensureStepPortableId(
      transaction,
      config.stepTable,
      step.id,
      step.collaborationPortableId,
      config.stepPrefix,
    )
    if (step.flowNodeId) flowPortableByLocal.set(step.flowNodeId, portableId)
    steps.push({
      portableId,
      flowNodeId: step.flowNodeId ? portableId : null,
      order: step.order,
      keyword: keywordFor(step.gherkinStep),
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      label: step.label || step.gherkinStep,
      invocation: invocationProjection(step.invocationJson),
      parameters: step.parameters.map(parameter => ({
        name: parameter.name,
        value: config.parameterValue(parameter),
        type: parameter.type,
        order: parameter.order,
        locatorPortableId: config.parameterLocatorId(parameter)
          ? portable('locator', config.parameterLocatorId(parameter)!)
          : null,
      })),
    })
  }
  const blockPortableIds = new Map<string, string>()
  for (const block of blocksInput) {
    const portableId = await ensureStepPortableId(
      transaction,
      config.blockTable,
      block.id,
      block.collaborationPortableId,
      config.blockPrefix,
    )
    blockPortableIds.set(block.id, portableId)
    if (block.collaborationPortableId) flowPortableByLocal.set(block.collaborationPortableId, portableId)
    flowPortableByLocal.set(block.id, portableId)
  }
  const flowBlocks = blocksInput.map(block => ({
    portableId: blockPortableIds.get(block.id)!,
    name: block.name,
    order: block.order,
    flowNodeIds: block.nodes.map(node => {
      const portableId = flowPortableByLocal.get(node.flowNodeId)
      if (!portableId) {
        throw new ServiceError(`Flow block ${block.id} references unknown node ${node.flowNodeId}.`, 'CONFLICT', 409)
      }
      return portableId
    }),
  }))
  return { steps, flowBlocks }
}

async function projectTestCases(
  transaction: Transaction,
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  const records: CollaborationRecord[] = []
  for (const item of entities.testCases) {
    const content = await projectScenarioContent(transaction, item.steps, item.flowBlocks, portable, {
      stepTable: 'testCaseStep',
      blockTable: 'testCaseFlowBlock',
      stepPrefix: 'case-step',
      blockPrefix: 'case-flow',
      parameterValue: parameter => parameter.value!,
      parameterLocatorId: parameter => parameter.locatorId!,
    })
    records.push({
      ...commonRecord(portableProjectId, portable('test-case', item.id), item.archivedAt),
      kind: 'test-case',
      payload: {
        title: item.title,
        description: item.description,
        ...content,
        tagPortableIds: filterTagPortableIds(item.tags, portable),
      },
    })
  }
  return records
}

async function projectTemplates(
  transaction: Transaction,
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  const records: CollaborationRecord[] = []
  for (const item of entities.templates) {
    const content = await projectScenarioContent(transaction, item.steps, item.flowBlocks, portable, {
      stepTable: 'templateTestCaseStep',
      blockTable: 'templateTestCaseFlowBlock',
      stepPrefix: 'template-step',
      blockPrefix: 'template-flow',
      parameterValue: parameter => parameter.defaultValue!,
      parameterLocatorId: parameter => parameter.defaultLocatorId ?? parameter.locatorId ?? null,
    })
    records.push({
      ...commonRecord(portableProjectId, portable('template', item.id), item.archivedAt),
      kind: 'template',
      payload: { name: item.name, description: item.description, ...content },
    })
  }
  return records
}

function projectBaseReferenceRecords(
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  const records: CollaborationRecord[] = []
  for (const item of entities.modules) {
    records.push({
      ...commonRecord(portableProjectId, portable('module', item.id), item.archivedAt),
      kind: 'module',
      payload: { name: item.name, parentPortableId: item.parentId ? portable('module', item.parentId) : null },
    })
  }
  for (const item of entities.tags) {
    records.push({
      ...commonRecord(portableProjectId, portable('tag', item.id), item.archivedAt),
      kind: 'tag',
      payload: { name: item.name, expression: item.tagExpression, type: 'FILTER' },
    })
  }
  for (const item of entities.locatorGroups) {
    records.push({
      ...commonRecord(portableProjectId, portable('locator-group', item.id), item.archivedAt),
      kind: 'locator-group',
      payload: { name: item.name, route: item.route, modulePortableId: portable('module', item.moduleId) },
    })
  }
  for (const item of entities.locators) {
    if (!item.locatorGroupId && !item.archivedAt) {
      throw new ServiceError(`Active locator ${item.id} has no locator group.`, 'CONFLICT', 409)
    }
    if (item.locatorGroupId) {
      records.push({
        ...commonRecord(portableProjectId, portable('locator', item.id), item.archivedAt),
        kind: 'locator',
        payload: {
          name: item.name,
          value: item.value,
          locatorGroupPortableId: portable('locator-group', item.locatorGroupId),
        },
      })
    }
  }
  return records
}

function projectSuiteRecords(
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  const records: CollaborationRecord[] = []
  for (const item of entities.suites) {
    records.push({
      ...commonRecord(portableProjectId, portable('test-suite', item.id), item.archivedAt),
      kind: 'test-suite',
      payload: {
        name: item.name,
        description: item.description,
        modulePortableId: portable('module', item.moduleId),
        testCasePortableIds: item.testCases.map(testCase => portable('test-case', testCase.id)),
        tagPortableIds: filterTagPortableIds(item.tags, portable),
      },
    })
  }
  return records
}

function projectEnvironmentRecords(
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  return entities.environments.map(item => ({
    ...commonRecord(portableProjectId, portable('environment-reference', item.id), item.archivedAt),
    kind: 'environment-reference' as const,
    payload: { name: item.name },
  }))
}

function projectReferenceRecords(
  entities: Awaited<ReturnType<typeof loadProjectionEntities>>,
  portableProjectId: string,
  portable: Portable,
) {
  return [
    ...projectBaseReferenceRecords(entities, portableProjectId, portable),
    ...projectSuiteRecords(entities, portableProjectId, portable),
    ...projectEnvironmentRecords(entities, portableProjectId, portable),
  ]
}

export async function projectSnapshotInTransaction(
  transaction: Transaction,
  bindingId: string,
): Promise<CollaborationSnapshotFiles> {
  const binding = await transaction.collaborationBinding.findUnique({ where: { id: bindingId } })
  if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
  const entities = await loadProjectionEntities(transaction, binding.targetProjectId)
  const portable = await assignPortableIds(transaction, binding.id, entities)
  const records = projectReferenceRecords(entities, binding.portableProjectId, portable)
  records.push(...(await projectTestCases(transaction, entities, binding.portableProjectId, portable)))
  records.push(...(await projectTemplates(transaction, entities, binding.portableProjectId, portable)))
  return buildCollaborationSnapshotFiles(records, binding.portableProjectId)
}
