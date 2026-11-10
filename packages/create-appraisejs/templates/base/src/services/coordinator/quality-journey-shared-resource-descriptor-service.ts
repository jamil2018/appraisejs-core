import type { Prisma } from '@prisma/client'

import {
  canonicalSharedResourceJson,
  isSharedResourceId,
  sharedResourceBounds,
  sharedResourceDigest,
  sharedResourceKinds,
  type SharedResourceKind,
} from '@/lib/quality-journey/shared-resource-contract'
import { ServiceError } from '@/services/shared/errors'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/invocation-contracts'

export type SharedResourceDescriptorKey = Readonly<{ kind: SharedResourceKind; resourceId: string }>
export type SharedResourceDescriptorResult = Readonly<{
  protocol: 'M06_SHARED_DESCRIPTOR_V1'
  resources: readonly Readonly<SharedResourceDescriptorKey & { dependencyDigest: string }>[]
  dependencyDigest: string
  keys: readonly SharedResourceDescriptorKey[]
}>

type ModuleProjection = {
  id: string; targetProjectId: string; name: string; parentId: string | null; archivedAt: string | null
}
type DescriptorRecord = { kind: SharedResourceKind; resourceId: string; semantic: unknown }

const rowLimit = 65_536 // A valid canonical descriptor cannot exceed the pure encoder's node ceiling.
const refuse = (reason: string): never => {
  throw new ServiceError('Shared resource descriptor requires exact bounded canonical dependencies.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_DESCRIPTOR_V1', reason,
  })
}
const compareId = (left: { id: string }, right: { id: string }) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0
const compareOrder = (left: { order: number; id: string }, right: { order: number; id: string }) =>
  left.order - right.order || compareId(left, right)
const compareKey = (left: SharedResourceDescriptorKey, right: SharedResourceDescriptorKey) =>
  left.kind < right.kind ? -1 : left.kind > right.kind ? 1 :
    left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0

/**
 * Read-only descriptor resolution. The caller must CAS every resolved domain and
 * guard and reread these exact descriptors before publication in its owning Prisma
 * transaction. This helper neither establishes transaction coverage nor checks
 * producer authority, source identity, resource coverage, claims, or E2 admission.
 * Raw semantic values remain transient; only keys and digests leave this function.
 */
export async function resolveSharedResourceDescriptors(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  selected: readonly SharedResourceDescriptorKey[],
): Promise<SharedResourceDescriptorResult> {
  if (!isSharedResourceId(targetProjectId) || !Array.isArray(selected) ||
    selected.length < 1 || selected.length > sharedResourceBounds.keys) refuse('SELECTION_SCOPE_OR_BOUNDS')
  const selection = selected.map(key => {
    if (!key) return refuse('SELECTION_KEY')
    const { kind, resourceId } = key
    if (!sharedResourceKinds.includes(kind) || !isSharedResourceId(resourceId)) return refuse('SELECTION_KEY')
    return { kind, resourceId }
  }).sort(compareKey)
  let previous: SharedResourceDescriptorKey | undefined
  for (const key of selection) {
    if (previous?.kind === key.kind && previous.resourceId === key.resourceId) refuse('SELECTION_DUPLICATE')
    previous = key
  }
  const target = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
  if (!target || target.id !== targetProjectId) refuse('TARGET_MISSING')

  let rowsRead = 0
  let scalarBytes = 0
  let descriptorBytes = 2 // The complete descriptor's enclosing array.
  const records = new Map<string, DescriptorRecord>()
  const modules = new Map<string, ModuleProjection>()
  const keyOf = (kind: SharedResourceKind, id: string) => `${kind}\n${id}`
  const remainingTake = () => rowLimit - rowsRead + 1
  const chargeRows = (count: number) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > rowLimit - rowsRead) refuse('RELATION_ROWS_UNBOUNDED')
    rowsRead += count
  }
  const text = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > sharedResourceBounds.bytes) return refuse('SCALAR_STRING')
    scalarBytes += Buffer.byteLength(JSON.stringify(value), 'utf8')
    if (scalarBytes > sharedResourceBounds.bytes) refuse('DESCRIPTOR_BYTES')
    return value
  }
  const id = (value: unknown): string => {
    if (!isSharedResourceId(value)) return refuse('SCALAR_ID')
    return text(value)
  }
  const optionalId = (value: unknown): string | null => value === null ? null : id(value)
  const iso = (value: unknown): string => {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return refuse('SCALAR_DATE')
    return text(value.toISOString())
  }
  const optionalDate = (value: unknown): string | null => value === null ? null : iso(value)
  const order = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647)
      return refuse('RELATION_ORDER')
    return value
  }
  const assertScope = (row: { id: string; targetProjectId: string } | null, expected: string) => {
    if (!row || row.id !== expected || row.targetProjectId !== targetProjectId) refuse('RESOURCE_MISSING_OR_FOREIGN')
  }
  const add = (kind: SharedResourceKind, resourceId: string, semantic: unknown) => {
    const key = keyOf(kind, resourceId)
    if (records.has(key)) return
    if (records.size >= sharedResourceBounds.keys) refuse('DEPENDENCY_KEYS_UNBOUNDED')
    // Validate each projection promptly; the final whole-set encoding also bounds
    // repeated ancestry and relation metadata across all resource projections.
    const record = { kind, resourceId, semantic }
    const encoded = canonicalSharedResourceJson(record)
    descriptorBytes += Buffer.byteLength(encoded, 'utf8') + (records.size ? 1 : 0)
    if (descriptorBytes > sharedResourceBounds.bytes) refuse('DESCRIPTOR_BYTES')
    records.set(key, record)
  }
  const uniqueRows = (rows: readonly { id: string }[]) => {
    const seen = new Set<string>()
    for (const row of rows) {
      if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('RELATION_DUPLICATE_OR_INVALID_ID')
      seen.add(row.id)
    }
  }

  async function loadModuleRow(moduleId: string): Promise<ModuleProjection> {
    const cached = modules.get(moduleId)
    if (cached) return cached
    const row = await tx.module.findUnique({ where: { id: moduleId },
      select: { id: true, targetProjectId: true, name: true, parentId: true, archivedAt: true } })
    assertScope(row, moduleId)
    if (!row) return refuse('MODULE_MISSING')
    chargeRows(1)
    const projection = { id: id(row.id), targetProjectId: id(row.targetProjectId), name: text(row.name),
      parentId: optionalId(row.parentId), archivedAt: optionalDate(row.archivedAt) }
    modules.set(moduleId, projection)
    return projection
  }

  async function moduleChain(moduleId: string): Promise<ModuleProjection[]> {
    const chain: ModuleProjection[] = []
    const seen = new Set<string>()
    let current: string | null = moduleId
    while (current !== null) {
      if (seen.has(current)) return refuse('MODULE_ANCESTRY_CYCLE')
      if (chain.length >= sharedResourceBounds.keys) return refuse('MODULE_ANCESTRY_UNBOUNDED')
      seen.add(current)
      const row = await loadModuleRow(current)
      chain.push(row)
      current = row.parentId
    }
    for (let index = 0; index < chain.length; index++) {
      const row = chain[index]!
      add('MODULE', row.id, { ...row, ancestors: chain.slice(index + 1) })
    }
    return chain
  }

  async function loadGroup(groupId: string): Promise<void> {
    if (records.has(keyOf('LOCATOR_GROUP', groupId))) return
    const row = await tx.locatorGroup.findUnique({ where: { id: groupId },
      select: { id: true, targetProjectId: true, name: true, route: true, moduleId: true, archivedAt: true } })
    assertScope(row, groupId)
    if (!row) return refuse('GROUP_MISSING')
    chargeRows(1)
    const semantic = { id: id(row.id), targetProjectId: id(row.targetProjectId), name: text(row.name),
      route: text(row.route), moduleId: id(row.moduleId), archivedAt: optionalDate(row.archivedAt),
      moduleAncestry: await moduleChain(row.moduleId) }
    add('LOCATOR_GROUP', row.id, semantic)
  }

  async function loadLocator(locatorId: string): Promise<void> {
    if (records.has(keyOf('LOCATOR', locatorId))) return
    const row = await tx.locator.findUnique({ where: { id: locatorId },
      select: { id: true, targetProjectId: true, name: true, value: true, updatedAt: true,
        locatorGroupId: true, archivedAt: true } })
    assertScope(row, locatorId)
    if (!row) return refuse('LOCATOR_MISSING')
    chargeRows(1)
    const semantic = { id: id(row.id), targetProjectId: id(row.targetProjectId), name: text(row.name),
      value: text(row.value), updatedAt: iso(row.updatedAt), locatorGroupId: optionalId(row.locatorGroupId),
      archivedAt: optionalDate(row.archivedAt) }
    if (semantic.locatorGroupId !== null) await loadGroup(semantic.locatorGroupId)
    add('LOCATOR', row.id, semantic)
  }

  async function loadTags(ownerKind: 'TEST_SUITE' | 'TEST_CASE', ownerId: string) {
    const tags = await tx.tag.findMany({
      where: ownerKind === 'TEST_SUITE' ? { testSuites: { some: { id: ownerId } } } : { testCases: { some: { id: ownerId } } },
      select: { id: true, targetProjectId: true, name: true, type: true, tagExpression: true, archivedAt: true },
      orderBy: { id: 'asc' }, take: remainingTake(),
    })
    chargeRows(tags.length)
    uniqueRows(tags)
    return tags.sort(compareId).map(tag => {
      if (tag.targetProjectId !== targetProjectId || !['IDENTIFIER', 'FILTER'].includes(tag.type))
        return refuse('TAG_SCOPE_OR_TYPE')
      return { id: id(tag.id), targetProjectId: id(tag.targetProjectId), name: text(tag.name), type: tag.type,
        tagExpression: text(tag.tagExpression), archivedAt: optionalDate(tag.archivedAt) }
    })
  }

  async function loadSuite(suiteId: string): Promise<void> {
    if (records.has(keyOf('TEST_SUITE', suiteId))) return
    const row = await tx.testSuite.findUnique({ where: { id: suiteId },
      select: { id: true, targetProjectId: true, name: true, description: true, moduleId: true, archivedAt: true } })
    assertScope(row, suiteId)
    if (!row) return refuse('SUITE_MISSING')
    chargeRows(1)
    const base = { id: id(row.id), targetProjectId: id(row.targetProjectId), name: text(row.name),
      description: row.description === null ? null : text(row.description), moduleId: id(row.moduleId),
      archivedAt: optionalDate(row.archivedAt) }
    await moduleChain(base.moduleId)
    const members = await tx.testCase.findMany({ where: { TestSuite: { some: { id: suiteId } } },
      select: { id: true, targetProjectId: true }, orderBy: { id: 'asc' }, take: remainingTake() })
    chargeRows(members.length)
    uniqueRows(members)
    const selectedCaseIds = members.sort(compareId).map(member => {
      if (member.targetProjectId !== targetProjectId) return refuse('SUITE_MEMBER_FOREIGN_TARGET')
      return id(member.id)
    })
    // Membership is captured, but member content is resolved only when that Case
    // was separately selected. Merely observing inventory never claims it.
    add('TEST_SUITE', row.id, { ...base, selectedCaseIds, tags: await loadTags('TEST_SUITE', suiteId) })
  }

  async function loadCase(caseId: string): Promise<void> {
    if (records.has(keyOf('TEST_CASE', caseId))) return
    const row = await tx.testCase.findUnique({ where: { id: caseId },
      select: { id: true, targetProjectId: true, title: true, description: true, archivedAt: true } })
    assertScope(row, caseId)
    if (!row) return refuse('CASE_MISSING')
    chargeRows(1)
    const base = { id: id(row.id), targetProjectId: id(row.targetProjectId), title: text(row.title),
      description: text(row.description), archivedAt: optionalDate(row.archivedAt) }
    const steps = await tx.testCaseStep.findMany({ where: { testCaseId: caseId },
      select: { id: true, testCaseId: true, order: true, flowNodeId: true, gherkinStep: true, icon: true,
        label: true, invocationJson: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: remainingTake() })
    chargeRows(steps.length)
    uniqueRows(steps)
    const projectedSteps = []
    for (const step of steps.sort(compareOrder)) {
      if (step.testCaseId !== caseId || !['MOUSE', 'NAVIGATION', 'INPUT', 'DOWNLOAD', 'API', 'STORE',
        'FORMAT', 'DATA', 'UPLOAD', 'WAIT', 'VALIDATION', 'DEBUG'].includes(step.icon)) refuse('STEP_SCOPE_OR_ICON')
      const invocationJson = text(step.invocationJson)
      try {
        const parsed: unknown = JSON.parse(invocationJson)
        // Check the bounded raw shape before schema parsing so deeply nested or
        // oversized input does not become an unbounded schema traversal.
        canonicalSharedResourceJson(parsed)
        stepInvocationSchema.parse(parsed)
      } catch {
        return refuse('STEP_INVOCATION_MALFORMED_OR_UNBOUNDED')
      }
      const parameters = await tx.testCaseStepParameter.findMany({ where: { testCaseStepId: step.id },
        select: { id: true, testCaseStepId: true, name: true, value: true, order: true, locatorId: true, type: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }], take: remainingTake() })
      chargeRows(parameters.length)
      uniqueRows(parameters)
      const projectedParameters = []
      for (const parameter of parameters.sort(compareOrder)) {
        if (parameter.testCaseStepId !== step.id || !['NUMBER', 'STRING', 'DATE', 'BOOLEAN', 'LOCATOR'].includes(parameter.type))
          return refuse('PARAMETER_SCOPE_OR_TYPE')
        const locatorId = optionalId(parameter.locatorId)
        if (parameter.type === 'LOCATOR' && locatorId === null) return refuse('PARAMETER_LOCATOR_MISSING')
        if (locatorId !== null) await loadLocator(locatorId)
        projectedParameters.push({ id: id(parameter.id), name: text(parameter.name), value: text(parameter.value),
          order: order(parameter.order), type: parameter.type, locatorId })
      }
      projectedSteps.push({ id: id(step.id), order: order(step.order), flowNodeId: optionalId(step.flowNodeId),
        gherkinStep: text(step.gherkinStep), icon: step.icon, label: text(step.label), invocationJson,
        parameters: projectedParameters })
    }
    const blocks = await tx.testCaseFlowBlock.findMany({ where: { testCaseId: caseId },
      select: { id: true, testCaseId: true, name: true, order: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }], take: remainingTake() })
    chargeRows(blocks.length)
    uniqueRows(blocks)
    const flowBlocks = []
    for (const block of blocks.sort(compareOrder)) {
      if (block.testCaseId !== caseId) return refuse('FLOW_BLOCK_SCOPE')
      const nodes = await tx.testCaseFlowBlockNode.findMany({ where: { flowBlockId: block.id },
        select: { id: true, flowBlockId: true, flowNodeId: true }, orderBy: { id: 'asc' }, take: remainingTake() })
      chargeRows(nodes.length)
      uniqueRows(nodes)
      flowBlocks.push({ id: id(block.id), name: text(block.name), order: order(block.order),
        nodes: nodes.sort(compareId).map(node => {
          if (node.flowBlockId !== block.id) return refuse('FLOW_NODE_SCOPE')
          return { id: id(node.id), flowNodeId: id(node.flowNodeId) }
        }) })
    }
    add('TEST_CASE', row.id, { ...base, steps: projectedSteps, flowBlocks, tags: await loadTags('TEST_CASE', caseId) })
  }

  for (const resource of selection) {
    switch (resource.kind) {
      case 'MODULE': await moduleChain(resource.resourceId); break
      case 'LOCATOR_GROUP': await loadGroup(resource.resourceId); break
      case 'LOCATOR': await loadLocator(resource.resourceId); break
      case 'TEST_SUITE': await loadSuite(resource.resourceId); break
      case 'TEST_CASE': await loadCase(resource.resourceId); break
      default: refuse('RESOURCE_KIND_UNSUPPORTED')
    }
  }
  const ordered = [...records.values()].sort(compareKey)
  // Hashing the complete raw set enforces the 1MiB/shape bound across the whole
  // descriptor, not merely the much smaller list of per-resource digests.
  const dependencyDigest = sharedResourceDigest('M06_SHARED_DEPENDENCY_SET_V1', ordered)
  const resources = ordered.map(record => Object.freeze({ kind: record.kind, resourceId: record.resourceId,
    dependencyDigest: sharedResourceDigest('M06_SHARED_RESOURCE_DESCRIPTOR_V1', record) }))
  return Object.freeze({ protocol: 'M06_SHARED_DESCRIPTOR_V1', resources: Object.freeze(resources), dependencyDigest,
    keys: Object.freeze(resources.map(({ kind, resourceId }) => Object.freeze({ kind, resourceId }))) })
}
