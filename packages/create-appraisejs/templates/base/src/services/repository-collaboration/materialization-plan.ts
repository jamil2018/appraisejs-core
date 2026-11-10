import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { canonicalJson, MAX_COLLABORATION_RECORD_BYTES, MAX_COLLABORATION_TOTAL_BYTES, recordKey, type CollaborationRecord } from '@/lib/repository-collaboration'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import type { SharedResourceMutationKey } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { collectSharedModuleMutationEffectsInTransaction } from '@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service'
import { ServiceError } from '@/services/shared/errors'
import { createCollisionChecker, entityKindByRecordKind } from './materialization-helpers'

type Tx = Prisma.TransactionClient
type Kind = CollaborationRecord['kind']
type Existing = { id: string; targetProjectId: string; archivedAt: Date | null; collaborationManaged: boolean;
  parentId?: string | null; moduleId?: string; locatorGroupId?: string | null }
type ChildIds = { steps: string[]; parameters: string[][]; blocks: string[]; nodes: string[][] }
export type MaterializationPlan = {
  localIdByKey: Map<string, string | null>
  entityMapIdByKey: Map<string, string>
  existingByKey: Map<string, Existing | null>
  childrenByKey: Map<string, ChildIds>
  environmentIdByKey: Map<string, string>
  mapCreates: Prisma.CollaborationEntityMapUncheckedCreateInput[]
  mapUpdates: Array<{ id: string; localEntityId: string }>
  batch: { existing: SharedResourceMutationKey[]; newRoots: SharedResourceMutationKey[]; deleted: [] }
}
const rootSelect = { id: true, targetProjectId: true, archivedAt: true, collaborationManaged: true } as const
const rowLimit = 65_536
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Collaboration materialization requires exact bounded shared-resource effects.', 'CONFLICT', 409,
    { protocol: 'M06_SHARED_COLLABORATION_MUTATION_EFFECTS_V1', reason })
}
const domainByKind: Partial<Record<Kind, SharedResourceMutationKey['kind']>> = {
  module: 'MODULE', 'locator-group': 'LOCATOR_GROUP', locator: 'LOCATOR',
  'test-case': 'TEST_CASE', 'test-suite': 'TEST_SUITE',
}
async function readRoot(tx: Tx, kind: Kind, id: string): Promise<Existing | null> {
  switch (kind) {
    case 'module': return tx.module.findUnique({ where: { id }, select: { ...rootSelect, parentId: true } })
    case 'locator-group': return tx.locatorGroup.findUnique({ where: { id }, select: { ...rootSelect, moduleId: true } })
    case 'locator': return tx.locator.findUnique({ where: { id }, select: { ...rootSelect, locatorGroupId: true } })
    case 'test-case': return tx.testCase.findUnique({ where: { id }, select: rootSelect })
    case 'test-suite': return tx.testSuite.findUnique({ where: { id }, select: { ...rootSelect, moduleId: true } })
    case 'tag': return tx.tag.findUnique({ where: { id }, select: rootSelect })
    case 'template': return tx.templateTestCase.findUnique({ where: { id }, select: rootSelect })
    default: return null
  }
}

/** Inert, transaction-local metadata only. No guard, mapping, root or child writer runs here. */
export async function planCollaborationMaterialization(
  tx: Tx, binding: { id: string; targetProjectId: string }, records: CollaborationRecord[],
  adopted: Map<string, string> | undefined, now: Date,
): Promise<MaterializationPlan> {
  if (!isSharedResourceId(binding.targetProjectId) || records.length > 10_000) refuse('INPUT_BOUND')
  if (records.some(record => !Object.hasOwn(entityKindByRecordKind, record.kind))) refuse('RECORD_KIND_UNSUPPORTED')
  // The executor's module recursion includes archived records too: settle that exact finite order now.
  const moduleRecords = new Map(records.filter((record): record is Extract<CollaborationRecord, { kind: 'module' }> =>
    record.kind === 'module').map(record => [record.portableId, record]))
  for (const record of moduleRecords.values()) {
    const seen = new Set<string>(); let at: string | null = record.portableId
    while (at !== null) {
      if (seen.has(at) || seen.size >= sharedResourceBounds.keys) refuse('MODULE_RECORD_CYCLE')
      seen.add(at)
      const parent = moduleRecords.get(at)
      if (!parent) refuse('MODULE_RECORD_PARENT')
      at = parent!.payload.parentPortableId
    }
  }
  let inputBytes = 0
  for (const record of records) {
    let encoded: string
    try { encoded = canonicalJson(record) } catch { return refuse('NONCANONICAL_RECORD') }
    const bytes = Buffer.byteLength(encoded, 'utf8'); inputBytes += bytes
    if (bytes > MAX_COLLABORATION_RECORD_BYTES || inputBytes > MAX_COLLABORATION_TOTAL_BYTES) refuse('INPUT_BYTE_BOUND')
  }
  let examined = 0
  const take = () => rowLimit - examined + 1
  const rows = <T extends { id: string }>(values: T[]) => {
    examined += values.length
    if (examined > rowLimit) refuse('ROW_BOUND')
    const seen = new Set<string>()
    for (const value of values) {
      if (!isSharedResourceId(value.id) || seen.has(value.id)) refuse('ROW_IDENTITY')
      seen.add(value.id)
    }
    return values
  }
  const scoped = <T extends { id: string; targetProjectId: string }>(values: T[]) => {
    rows(values)
    if (values.some(value => value.targetProjectId !== binding.targetProjectId)) refuse('FOREIGN_ENDPOINT')
    return values
  }
  const exact = (ids: string[], values: Array<{ id: string }>) => {
    if (values.length !== ids.length || values.some(value => !ids.includes(value.id))) refuse('MISSING_ENDPOINT')
  }
  const plan: MaterializationPlan = { localIdByKey: new Map(), entityMapIdByKey: new Map(),
    existingByKey: new Map(), childrenByKey: new Map(), environmentIdByKey: new Map(),
    mapCreates: [], mapUpdates: [], batch: { existing: [], newRoots: [], deleted: [] } }
  const mappings = rows(await tx.collaborationEntityMap.findMany({ where: { bindingId: binding.id },
    select: { id: true, bindingId: true, kind: true, portableId: true, localEntityId: true }, take: take() }))
  const byMapKey = new Map<string, typeof mappings[number]>()
  const byLocalKey = new Map<string, string>()
  for (const mapping of mappings) {
    const key = `${mapping.kind}:${mapping.portableId}`
    if (mapping.bindingId !== binding.id || byMapKey.has(key) ||
      (mapping.localEntityId !== null && !isSharedResourceId(mapping.localEntityId))) refuse('MAPPING_SCOPE')
    byMapKey.set(key, mapping)
    if (mapping.localEntityId !== null) {
      const localKey = `${mapping.kind}:${mapping.localEntityId}`
      if (byLocalKey.has(localKey)) refuse('MAPPING_LOCAL_COLLISION')
      byLocalKey.set(localKey, key)
    }
    for (const [kind, entityKind] of Object.entries(entityKindByRecordKind)) {
      if (entityKind === mapping.kind) plan.localIdByKey.set(`${kind}:${mapping.portableId}`, mapping.localEntityId)
    }
  }
  for (const record of records) {
    const key = recordKey(record), entityKind = entityKindByRecordKind[record.kind]
    const mapKey = `${entityKind}:${record.portableId}`, mapping = byMapKey.get(mapKey)
    let id = mapping?.localEntityId ?? null
    if (!mapping || (!id && !record.archived)) {
      id = adopted?.get(key) ?? (record.archived ? null : randomUUID())
      if (id !== null && !isSharedResourceId(id)) refuse('LOCAL_ID')
      if (id !== null) {
        const previous = byLocalKey.get(`${entityKind}:${id}`)
        // This is the canonical map's (binding,kind,localEntityId) unique constraint.
        if (previous && previous !== mapKey) refuse('MAPPING_LOCAL_COLLISION')
        byLocalKey.set(`${entityKind}:${id}`, mapKey)
      }
      if (mapping && id) plan.mapUpdates.push({ id: mapping.id, localEntityId: id })
    }
    const mapId = mapping?.id ?? randomUUID()
    if (!mapping) plan.mapCreates.push({ id: mapId, bindingId: binding.id, kind: entityKind,
      portableId: record.portableId, localEntityId: id, archivedAt: record.archived ? now : null })
    plan.entityMapIdByKey.set(key, mapId); plan.localIdByKey.set(key, id)
    // Preserve the old archive-without-local-identity error before any metadata writer.
    if (!id) throw new ServiceError(`Missing local identity for ${key}.`, 'INTERNAL', 500)
  }
  const local = (kind: Kind, portableId: string) => {
    const id = plan.localIdByKey.get(`${kind}:${portableId}`)
    if (!id || !isSharedResourceId(id)) throw new ServiceError(`Missing local identity for ${kind}:${portableId}.`, 'INTERNAL', 500)
    return id
  }
  const existingKeys = new Map<string, SharedResourceMutationKey>(), newKeys = new Map<string, SharedResourceMutationKey>()
  const add = (kind: SharedResourceMutationKey['kind'], id: string, fresh = false) => {
    if (!isSharedResourceId(id)) refuse('RESOURCE_ID')
    const key = `${kind}:${id}`
    if (!fresh && newKeys.has(key)) return
    if (fresh && existingKeys.has(key)) refuse('RESOURCE_CLASSIFICATION')
    if (fresh) newKeys.set(key, { kind, resourceId: id })
    else existingKeys.set(key, { kind, resourceId: id })
    if (existingKeys.size + newKeys.size > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
  }
  const cached = new Map<string, Existing | null>()
  const get = async (kind: Kind, id: string) => {
    if (!isSharedResourceId(id)) return refuse('LOCAL_ID')
    const key = `${kind}:${id}`
    if (!cached.has(key)) {
      const value = await readRoot(tx, kind, id)
      if (value) { scoped([value]); if (value.id !== id) refuse('ROOT_IDENTITY') }
      cached.set(key, value)
    }
    return cached.get(key) ?? null
  }
  const active = new Map(records.filter(record => !record.archived).map(record =>
    [`${record.kind}:${local(record.kind, record.portableId)}`, record]))
  const endpoint = async (kind: Kind, id: string) => {
    const value = await get(kind, id)
    if (!value && !active.has(`${kind}:${id}`)) refuse('MISSING_ENDPOINT')
    return value
  }
  const moduleChain = async (start: string, planned: boolean) => {
    const seen = new Set<string>(); let id: string | null = start
    while (id !== null) {
      if (seen.has(id) || seen.size >= sharedResourceBounds.keys) refuse('MODULE_CYCLE')
      seen.add(id)
      const value = await endpoint('module', id)
      const record: CollaborationRecord | undefined = planned ? active.get(`module:${id}`) : undefined
      if (record?.kind === 'module') id = record.payload.parentPortableId ? local('module', record.payload.parentPortableId) : null
      else {
        if (!value || (value.parentId !== null && !isSharedResourceId(value.parentId))) refuse('MODULE_ENDPOINT')
        id = value.parentId!
      }
    }
  }
  const existingLocatorScope = async (ids: string[]) => {
    for (const id of [...new Set(ids)]) if (!await get('locator', id)) refuse('MISSING_OLD_LOCATOR')
  }
  const plannedLocatorScope = async (ids: string[]) => {
    for (const id of [...new Set(ids)]) await endpoint('locator', id)
  }
  const dependentCases = async (locatorIds: string[]) => {
    if (!locatorIds.length) return
    const parameters = rows(await tx.testCaseStepParameter.findMany({ where: { locatorId: { in: locatorIds } },
      select: { id: true, testCaseStepId: true, locatorId: true }, take: take() }))
    if (parameters.some(row => !row.locatorId || !locatorIds.includes(row.locatorId) || !isSharedResourceId(row.testCaseStepId))) refuse('PARAMETER_ENDPOINT')
    const stepIds = [...new Set(parameters.map(row => row.testCaseStepId))]
    const steps = stepIds.length ? rows(await tx.testCaseStep.findMany({ where: { id: { in: stepIds } },
      select: { id: true, testCaseId: true }, take: take() })) : []
    exact(stepIds, steps)
    const caseIds = [...new Set(steps.map(row => row.testCaseId))]
    for (const id of caseIds) {
      if (!await get('test-case', id)) refuse('CASE_ENDPOINT')
      add('TEST_CASE', id)
    }
    if (await tx.templateTestCaseStepParameter.findFirst({
      where: { OR: [{ locatorId: { in: locatorIds } }, { defaultLocatorId: { in: locatorIds } }] }, select: { id: true },
    })) refuse('TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED')
    if (await tx.conflictResolution.findFirst({
      where: { OR: [{ entityId: { in: locatorIds } }, { conflictingEntityId: { in: locatorIds } }] }, select: { id: true },
    })) refuse('LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED')
  }
  const validateChildren = async (id: string, template: boolean) => {
    const steps = template ? rows(await tx.templateTestCaseStep.findMany({ where: { templateTestCaseId: id },
      select: { id: true, templateTestCaseId: true }, take: take() })).map(row => ({ id: row.id, owner: row.templateTestCaseId })) :
      rows(await tx.testCaseStep.findMany({ where: { testCaseId: id },
        select: { id: true, testCaseId: true }, take: take() })).map(row => ({ id: row.id, owner: row.testCaseId }))
    if (steps.some(row => row.owner !== id)) refuse('CHILD_OWNER')
    const stepIds = steps.map(row => row.id)
    const parameters = template ? rows(await tx.templateTestCaseStepParameter.findMany({ where: { testCaseStepId: { in: stepIds } },
      select: { id: true, testCaseStepId: true, locatorId: true, defaultLocatorId: true }, take: take() }))
      .map(row => ({ owner: row.testCaseStepId, locators: [row.locatorId, row.defaultLocatorId] })) :
      rows(await tx.testCaseStepParameter.findMany({ where: { testCaseStepId: { in: stepIds } },
        select: { id: true, testCaseStepId: true, locatorId: true }, take: take() }))
        .map(row => ({ owner: row.testCaseStepId, locators: [row.locatorId] }))
    if (parameters.some(row => !stepIds.includes(row.owner))) refuse('PARAMETER_OWNER')
    await existingLocatorScope(parameters.flatMap(row => row.locators.filter((value): value is string => value !== null)))
    const blocks = template ? rows(await tx.templateTestCaseFlowBlock.findMany({ where: { templateTestCaseId: id },
      select: { id: true, templateTestCaseId: true }, take: take() })).map(row => ({ id: row.id, owner: row.templateTestCaseId })) :
      rows(await tx.testCaseFlowBlock.findMany({ where: { testCaseId: id },
        select: { id: true, testCaseId: true }, take: take() })).map(row => ({ id: row.id, owner: row.testCaseId }))
    if (blocks.some(row => row.owner !== id)) refuse('BLOCK_OWNER')
    const blockIds = blocks.map(row => row.id)
    const nodes = template ? rows(await tx.templateTestCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: blockIds } },
      select: { id: true, flowBlockId: true }, take: take() })) : rows(await tx.testCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: blockIds } },
      select: { id: true, flowBlockId: true }, take: take() }))
    if (nodes.some(row => !blockIds.includes(row.flowBlockId))) refuse('NODE_OWNER')
  }
  const collision = createCollisionChecker(tx, adopted, record => local(record.kind, record.portableId))
  const plannedNames = new Map<string, string>()
  const changedModules: string[] = []
  let childCount = 0
  for (const record of records) {
    const key = recordKey(record), id = local(record.kind, record.portableId)
    const existing = await get(record.kind, id)
    plan.existingByKey.set(key, existing)
    const domain = domainByKind[record.kind]
    if (domain && existing) add(domain, id)
    if (domain && !existing && !record.archived) add(domain, id, true)
    if (record.archived) continue
    const name = record.kind === 'test-case' ? record.payload.title : 'name' in record.payload ? record.payload.name : undefined
    if (name !== undefined && record.kind !== 'environment-reference') {
      const where = { targetProjectId: binding.targetProjectId,
        ...(record.kind === 'test-case' ? { title: name } : { name }),
        ...(record.kind === 'tag' ? { type: record.payload.type } : {}) }
      await collision(record, where)
      const signature = JSON.stringify([record.kind, name, record.kind === 'tag' ? record.payload.type : null])
      // An explicit adoption retains the old collision bypass; DB uniqueness still applies.
      if (!adopted?.has(key) && plannedNames.has(signature) && plannedNames.get(signature) !== id)
        throw new ServiceError(`First adoption review is required for ${key}.`, 'CONFLICT', 409)
      plannedNames.set(signature, id)
    }
    if (record.kind === 'test-case' || record.kind === 'template') {
      if (new Set(record.payload.steps.map(step => step.portableId)).size !== record.payload.steps.length ||
        new Set(record.payload.flowBlocks.map(block => block.portableId)).size !== record.payload.flowBlocks.length) refuse('CHILD_IDENTITY')
      childCount += record.payload.steps.length + record.payload.steps.reduce((count, step) => count + step.parameters.length, 0) +
        record.payload.flowBlocks.length + record.payload.flowBlocks.reduce((count, block) => count + block.flowNodeIds.length, 0)
      if (childCount > rowLimit) refuse('CHILD_BOUND')
      const children = { steps: record.payload.steps.map(() => randomUUID()),
        parameters: record.payload.steps.map(step => step.parameters.map(() => randomUUID())),
        blocks: record.payload.flowBlocks.map(() => randomUUID()),
        nodes: record.payload.flowBlocks.map(block => block.flowNodeIds.map(() => randomUUID())) }
      plan.childrenByKey.set(key, children)
    }
  }
  // Read every old and planned edge before the first mapping or semantic writer.
  for (const record of records) {
    const key = recordKey(record), id = local(record.kind, record.portableId), existing = plan.existingByKey.get(key)!
    if (record.kind === 'module') {
      if (existing) { changedModules.push(id); await moduleChain(id, false) }
      if (!record.archived) await moduleChain(id, true)
    } else if (record.kind === 'locator-group') {
      if (existing) {
        await moduleChain(existing.moduleId!, false)
        const locators = scoped(await tx.locator.findMany({ where: { locatorGroupId: id },
          select: { ...rootSelect, locatorGroupId: true }, take: take() }))
        if (locators.some(row => row.locatorGroupId !== id)) refuse('GROUP_ENDPOINT')
        for (const locator of locators) add('LOCATOR', locator.id)
        await dependentCases(locators.map(row => row.id))
      }
      if (!record.archived) await moduleChain(local('module', record.payload.modulePortableId), true)
    } else if (record.kind === 'locator') {
      if (existing) {
        if (existing.locatorGroupId !== null) {
          const group = await get('locator-group', existing.locatorGroupId!)
          if (!group) refuse('MISSING_OLD_GROUP')
          await moduleChain(group!.moduleId!, false)
        }
        await dependentCases([id])
      }
      if (!record.archived) {
        const groupId = local('locator-group', record.payload.locatorGroupPortableId)
        const group = await endpoint('locator-group', groupId)
        if (group) await moduleChain(group.moduleId!, false)
      }
    } else if (record.kind === 'tag' && existing) {
      const cases = scoped(await tx.testCase.findMany({ where: { tags: { some: { id } } }, select: rootSelect, take: take() }))
      const suites = scoped(await tx.testSuite.findMany({ where: { tags: { some: { id } } },
        select: { ...rootSelect, moduleId: true }, take: take() }))
      for (const value of cases) add('TEST_CASE', value.id)
      for (const value of suites) { add('TEST_SUITE', value.id); await moduleChain(value.moduleId, false) }
      scoped(await tx.testRun.findMany({ where: { tags: { some: { id } } }, select: { id: true, targetProjectId: true }, take: take() }))
      for (const parent of records) {
        if (!parent.archived && (parent.kind === 'test-case' || parent.kind === 'test-suite') &&
          parent.payload.tagPortableIds.some(portable => local('tag', portable) === id)) {
          const parentId = local(parent.kind, parent.portableId)
          add(parent.kind === 'test-case' ? 'TEST_CASE' : 'TEST_SUITE', parentId)
        }
      }
    } else if (record.kind === 'test-case' || record.kind === 'template') {
      if (existing) await validateChildren(id, record.kind === 'template')
      if (existing && record.kind === 'test-case') {
        scoped(await tx.tag.findMany({ where: { testCases: { some: { id } } }, select: rootSelect, take: take() }))
        const suites = scoped(await tx.testSuite.findMany({ where: { testCases: { some: { id } } },
          select: { ...rootSelect, moduleId: true }, take: take() }))
        for (const suite of suites) await moduleChain(suite.moduleId, false)
      }
      if (!record.archived) {
        for (const step of record.payload.steps) await plannedLocatorScope(step.parameters.flatMap(parameter =>
          parameter.locatorPortableId ? [local('locator', parameter.locatorPortableId)] : []))
        if (record.kind === 'test-case') {
          for (const portableId of record.payload.tagPortableIds) await endpoint('tag', local('tag', portableId))
        }
      }
    } else if (record.kind === 'test-suite') {
      if (existing) await moduleChain(existing.moduleId!, false)
      const oldCases = existing ? scoped(await tx.testCase.findMany({ where: { TestSuite: { some: { id } } },
        select: rootSelect, take: take() })) : []
      if (existing) scoped(await tx.tag.findMany({ where: { testSuites: { some: { id } } }, select: rootSelect, take: take() }))
      if (!record.archived) {
        await moduleChain(local('module', record.payload.modulePortableId), true)
        const next = record.payload.testCasePortableIds.map(portableId => local('test-case', portableId))
        if (new Set(next).size !== next.length) refuse('CASE_MEMBERSHIP_DUPLICATE')
        for (const caseId of next) await endpoint('test-case', caseId)
        const old = oldCases.map(value => value.id).sort(compare)
        if (JSON.stringify(old) !== JSON.stringify([...next].sort(compare)))
          for (const caseId of new Set([...old, ...next])) add('TEST_CASE', caseId)
        for (const portableId of record.payload.tagPortableIds) await endpoint('tag', local('tag', portableId))
      }
    } else if (record.kind === 'environment-reference' && !record.archived) {
      const mapping = await tx.collaborationEnvironmentMapping.findUnique({ where: {
        bindingId_portableId: { bindingId: binding.id, portableId: record.portableId } },
        select: { id: true, bindingId: true, portableId: true, localEnvironmentId: true, localScopeVersion: true } })
      if (!mapping) throw new ServiceError(`Environment ${record.portableId} requires an explicit local mapping.`, 'CONFLICT', 409)
      rows([mapping])
      if (mapping.bindingId !== binding.id || mapping.portableId !== record.portableId || !isSharedResourceId(mapping.localEnvironmentId))
        refuse('ENVIRONMENT_MAPPING_SCOPE')
      const environment = await tx.environment.findFirst({ where: { id: mapping.localEnvironmentId },
        select: { id: true, targetProjectId: true, archivedAt: true, scopeVersion: true } })
      if (!environment || environment.id !== mapping.localEnvironmentId || environment.targetProjectId !== binding.targetProjectId ||
        environment.archivedAt !== null || environment.scopeVersion !== mapping.localScopeVersion)
        throw new ServiceError(`Environment mapping ${record.portableId} is stale.`, 'CONFLICT', 409)
      scoped([environment]); plan.environmentIdByKey.set(key, environment.id)
    }
  }
  if (changedModules.length) {
    const effects = await collectSharedModuleMutationEffectsInTransaction(tx, binding.targetProjectId, [...new Set(changedModules)])
    for (const value of effects.existing) add(value.kind, value.resourceId)
  }
  const sort = (values: SharedResourceMutationKey[]) => values.sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
  plan.batch.existing = sort([...existingKeys.values()]); plan.batch.newRoots = sort([...newKeys.values()])
  return plan
}
