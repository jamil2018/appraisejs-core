import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import type { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { generateUniqueTestCaseIdentifier } from '@/lib/test-case-utils'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { TagType, type Prisma } from '@prisma/client'
import type { z } from 'zod'
import { ServiceError } from '@/services/shared/errors'
import { flowBlockCreates, testCaseStepCreates } from '@/services/shared/authored-step-persistence'
import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'
import {
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'

type Tx = Prisma.TransactionClient
type TestCaseInput = z.input<typeof testCaseSchema>
type Examined = { count: number }
const rowLimit = 65_536
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const caseSelect = { id: true, targetProjectId: true, archivedAt: true, collaborationManaged: true } as const
const tagSelect = { id: true, targetProjectId: true, name: true, tagExpression: true, type: true, archivedAt: true } as const
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Test case mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_TEST_CASE_MUTATION_EFFECTS_V1', reason,
  })
}
const relationships: () => never = () => {
  throw new ServiceError(
    'Test case project relationships are invalid or a referenced Step Definition is not ready and exact',
    'VALIDATION', 400,
  )
}
const missing: () => never = () => { throw new ServiceError('Test case not found', 'NOT_FOUND', 404) }
function examined<T extends { id: string }>(rows: T[], budget: Examined) {
  budget.count += rows.length
  if (budget.count > rowLimit) refuse('ROW_BOUND')
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('ROW_IDENTITY')
    seen.add(row.id)
  }
  return rows
}
function scoped<T extends { id: string; targetProjectId: string }>(rows: T[], targetProjectId: string, budget: Examined) {
  examined(rows, budget)
  if (rows.some(row => row.targetProjectId !== targetProjectId)) refuse('RELATED_SCOPE')
  return rows
}
function inputIds(ids: string[]) {
  if (!Array.isArray(ids) || ids.length > sharedResourceBounds.keys ||
    ids.some(id => !isSharedResourceId(id)) || new Set(ids).size !== ids.length) relationships()
  return [...ids]
}
function snapshot(value: TestCaseInput, targetProjectId: string) {
  if (!isSharedResourceId(targetProjectId)) relationships()
  const input = structuredClone(value)
  input.testSuiteIds = inputIds(input.testSuiteIds)
  input.tagIds = inputIds(input.tagIds ?? [])
  if (!Array.isArray(input.steps) || !Array.isArray(input.flowBlocks ?? [])) relationships()
  let count = input.steps.length + (input.flowBlocks?.length ?? 0)
  for (const step of input.steps) {
    if (!Array.isArray(step.parameters)) relationships()
    count += step.parameters.length
  }
  for (const block of input.flowBlocks ?? []) {
    if (!Array.isArray(block.nodeIds)) relationships()
    count += block.nodeIds.length
  }
  if (count > rowLimit) refuse('ROW_BOUND')
  return input
}
function keys(caseIds: string[], suiteIds: string[]): SharedResourceMutationKey[] {
  const result: SharedResourceMutationKey[] = [
    ...[...new Set(caseIds)].map(resourceId => ({ kind: 'TEST_CASE' as const, resourceId })),
    ...[...new Set(suiteIds)].map(resourceId => ({ kind: 'TEST_SUITE' as const, resourceId })),
  ]
  if (result.length > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
  return result.sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
}
async function suiteModules(tx: Tx, moduleIds: string[], targetProjectId: string, budget: Examined) {
  const ids = [...new Set(moduleIds)]
  if (!ids.length) return
  if (ids.some(id => !isSharedResourceId(id))) refuse('MODULE_ENDPOINT')
  const modules = scoped(await tx.module.findMany({ where: { id: { in: ids } },
    select: { id: true, targetProjectId: true }, take: rowLimit - budget.count + 1 }), targetProjectId, budget)
  if (modules.length !== ids.length || modules.some(row => !ids.includes(row.id))) refuse('MODULE_ENDPOINT')
}
async function validateTestCaseRelationships(tx: Tx, value: TestCaseInput, targetProjectId: string, budget: Examined) {
  const suites = examined(await tx.testSuite.findMany({ where: { id: { in: value.testSuiteIds } },
    select: { id: true, targetProjectId: true, moduleId: true, archivedAt: true },
    take: rowLimit - budget.count + 1 }), budget)
  if (suites.length !== value.testSuiteIds.length ||
    suites.some(row => !value.testSuiteIds.includes(row.id) || row.targetProjectId !== targetProjectId || row.archivedAt !== null)) relationships()
  await suiteModules(tx, suites.map(row => row.moduleId), targetProjectId, budget)
  const tags = examined(await tx.tag.findMany({ where: { id: { in: value.tagIds ?? [] } },
    select: tagSelect, take: rowLimit - budget.count + 1 }), budget)
  if (tags.length !== (value.tagIds ?? []).length || tags.some(row =>
    !(value.tagIds ?? []).includes(row.id) || row.targetProjectId !== targetProjectId || row.archivedAt !== null ||
    (row.type !== TagType.IDENTIFIER && row.type !== TagType.FILTER))) relationships()
  const definitions = await resolveReadyExactStepDefinitions(value.steps, tx)
  if (!definitions) relationships()
  return definitions
}
function prepareTestCaseWrites(value: TestCaseInput, definitions: Awaited<ReturnType<typeof validateTestCaseRelationships>>) {
  return { steps: testCaseStepCreates(value.steps, definitions), flowBlocks: flowBlockCreates(value.flowBlocks) }
}
async function oldRelationships(tx: Tx, ids: string[], targetProjectId: string, budget: Examined) {
  const suites = scoped(await tx.testSuite.findMany({ where: { testCases: { some: { id: { in: ids } } } },
    select: { id: true, targetProjectId: true, moduleId: true, archivedAt: true },
    orderBy: { id: 'asc' }, take: rowLimit - budget.count + 1 }), targetProjectId, budget)
  await suiteModules(tx, suites.map(row => row.moduleId), targetProjectId, budget)
  const tags = scoped(await tx.tag.findMany({ where: { testCases: { some: { id: { in: ids } } } },
    select: tagSelect, orderBy: { id: 'asc' }, take: rowLimit - budget.count + 1 }), targetProjectId, budget)
  if (tags.some(tag => typeof tag.name !== 'string' || typeof tag.tagExpression !== 'string' ||
    (tag.type !== TagType.IDENTIFIER && tag.type !== TagType.FILTER))) refuse('TAG_TYPE')
  return { suites, tags }
}
async function children(tx: Tx, ids: string[], targetProjectId: string, budget: Examined) {
  const steps = examined(await tx.testCaseStep.findMany({ where: { testCaseId: { in: ids } },
    select: { id: true, testCaseId: true }, take: rowLimit - budget.count + 1 }), budget)
  if (steps.some(row => !ids.includes(row.testCaseId))) refuse('STEP_ENDPOINT')
  const stepIds = steps.map(row => row.id)
  const parameters = examined(await tx.testCaseStepParameter.findMany({ where: { testCaseStepId: { in: stepIds } },
    select: { id: true, testCaseStepId: true, locatorId: true }, take: rowLimit - budget.count + 1 }), budget)
  if (parameters.some(row => !stepIds.includes(row.testCaseStepId) ||
    (row.locatorId !== null && !isSharedResourceId(row.locatorId)))) refuse('PARAMETER_ENDPOINT')
  const locatorIds = [...new Set(parameters.flatMap(row => row.locatorId === null ? [] : [row.locatorId]))]
  if (locatorIds.length) {
    const locators = scoped(await tx.locator.findMany({ where: { id: { in: locatorIds } },
      select: { id: true, targetProjectId: true }, take: rowLimit - budget.count + 1 }), targetProjectId, budget)
    if (locators.length !== locatorIds.length || locators.some(row => !locatorIds.includes(row.id))) refuse('LOCATOR_ENDPOINT')
  }
  const blocks = examined(await tx.testCaseFlowBlock.findMany({ where: { testCaseId: { in: ids } },
    select: { id: true, testCaseId: true }, take: rowLimit - budget.count + 1 }), budget)
  if (blocks.some(row => !ids.includes(row.testCaseId))) refuse('FLOW_BLOCK_ENDPOINT')
  const blockIds = blocks.map(row => row.id)
  const nodes = examined(await tx.testCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: blockIds } },
    select: { id: true, flowBlockId: true }, take: rowLimit - budget.count + 1 }), budget)
  if (nodes.some(row => !blockIds.includes(row.flowBlockId))) refuse('FLOW_NODE_ENDPOINT')
  return { stepIds, parameterIds: parameters.map(row => row.id), blockIds }
}
async function removeChildren(tx: Tx, ids: string[], owned: Awaited<ReturnType<typeof children>>) {
  if (owned.parameterIds.length) await tx.testCaseStepParameter.deleteMany({
    where: { id: { in: owned.parameterIds }, testCaseStepId: { in: owned.stepIds } },
  })
  if (owned.stepIds.length) await tx.testCaseStep.deleteMany({ where: { id: { in: owned.stepIds }, testCaseId: { in: ids } } })
  if (owned.blockIds.length) await tx.testCaseFlowBlock.deleteMany({ where: { id: { in: owned.blockIds }, testCaseId: { in: ids } } })
}
async function deletionReferences(tx: Tx, ids: string[], targetProjectId: string, budget: Examined) {
  // No historical source proof exists for erasure or a dangling bare Case identity.
  const where = { testCaseId: { in: ids } }, select = { id: true }
  if (await tx.testRunTestCase.findFirst({ where, select }) || await tx.review.findFirst({ where, select }) ||
    await tx.linkedJiraTicket.findFirst({ where, select }) || await tx.reportTestCase.findFirst({ where, select }) ||
    await tx.qualityJourneyAutomationMaterialization.findFirst({ where, select }) ||
    await tx.qualityJourneyAutomationTargetBinding.findFirst({ where, select })) refuse('HISTORICAL_CASE_REFERENCE')
  // Metrics are an excluded derived projection; validate its exact cascade scope.
  const metrics = scoped(await tx.testCaseMetrics.findMany({ where,
    select: { id: true, targetProjectId: true, testCaseId: true },
    take: rowLimit - budget.count + 1 }), targetProjectId, budget)
  if (metrics.some(row => !ids.includes(row.testCaseId))) refuse('METRICS_ENDPOINT')
}
async function orphanIdentifiers(tx: Tx, tags: Awaited<ReturnType<typeof oldRelationships>>['tags'],
  ids: string[], targetProjectId: string, budget: Examined) {
  const candidates = tags.filter(tag => tag.type === TagType.IDENTIFIER && tag.name.startsWith('tc_'))
  if (candidates.length > sharedResourceBounds.keys) refuse('IDENTIFIER_TAG_BOUND')
  const orphanIds: string[] = []
  for (const candidate of candidates) {
    const tag = await tx.tag.findFirst({ where: { id: candidate.id }, select: { ...tagSelect,
      testCases: { select: { id: true, targetProjectId: true }, take: rowLimit - budget.count + 1 },
      testSuites: { select: { id: true, targetProjectId: true }, take: rowLimit - budget.count + 1 },
      testRuns: { select: { id: true, targetProjectId: true }, take: rowLimit - budget.count + 1 },
    } })
    if (!tag || tag.id !== candidate.id || tag.targetProjectId !== targetProjectId ||
      tag.type !== TagType.IDENTIFIER || !tag.name.startsWith('tc_')) refuse('IDENTIFIER_TAG_SCOPE')
    examined([tag], budget)
    scoped(tag.testCases, targetProjectId, budget); scoped(tag.testSuites, targetProjectId, budget)
    scoped(tag.testRuns, targetProjectId, budget)
    if (!tag.testSuites.length && !tag.testRuns.length && tag.testCases.every(row => ids.includes(row.id))) orphanIds.push(tag.id)
  }
  return orphanIds
}

export async function createTestCaseFromInput(value: TestCaseInput, targetProjectId: string) {
  const input = snapshot(value, targetProjectId), id = randomUUID()
  return prisma.$transaction(async tx => {
    const definitions = await validateTestCaseRelationships(tx, input, targetProjectId, { count: 0 })
    const prepared = prepareTestCaseWrites(input, definitions), existing = keys([], input.testSuiteIds)
    if (existing.length + 1 > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing, newRoots: [{ kind: 'TEST_CASE', resourceId: id }], deleted: [],
    })
    const name = generateUniqueTestCaseIdentifier()
    const identifier = await tx.tag.create({ data: { name, type: TagType.IDENTIFIER, tagExpression: `@${name}`, targetProjectId } })
    return tx.testCase.create({ data: { id, title: input.title, description: input.description ?? '', targetProjectId,
      TestSuite: { connect: input.testSuiteIds.map(resourceId => ({ id: resourceId })) },
      tags: { connect: [identifier.id, ...(input.tagIds ?? [])].map(tagId => ({ id: tagId })) },
      steps: { create: prepared.steps }, flowBlocks: { create: prepared.flowBlocks },
    }, include: { TestSuite: { select: { id: true } } } })
  })
}

export async function updateTestCaseFromInput(value: TestCaseInput, id: string, targetProjectId: string) {
  const input = snapshot(value, targetProjectId)
  if (!isSharedResourceId(id)) missing()
  return prisma.$transaction(async tx => {
    const current = await tx.testCase.findFirst({ where: { id }, select: caseSelect })
    if (!current || current.id !== id || current.targetProjectId !== targetProjectId || current.archivedAt !== null) missing()
    const budget = { count: 0 }
    examined([current], budget)
    const definitions = await validateTestCaseRelationships(tx, input, targetProjectId, budget)
    const prepared = prepareTestCaseWrites(input, definitions)
    const old = await oldRelationships(tx, [id], targetProjectId, budget)
    const owned = await children(tx, [id], targetProjectId, budget)
    const tagIds = [...new Set([...old.tags.filter(tag => tag.type === TagType.IDENTIFIER && tag.archivedAt === null)
      .map(tag => tag.id), ...(input.tagIds ?? [])])]
    // testSuiteIds remain validation-only on update; this writer does not change membership.
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: keys([id], []), newRoots: [], deleted: [] })
    await removeChildren(tx, [id], owned)
    return tx.testCase.update({ where: { id }, data: { title: input.title, description: input.description ?? '',
      tags: { set: tagIds.map(tagId => ({ id: tagId })) },
      steps: { create: prepared.steps }, flowBlocks: { create: prepared.flowBlocks },
    }, include: { steps: true } })
  })
}

export async function deleteTestCasesByIds(ids: string[], targetProjectId: string): Promise<void> {
  if (!isSharedResourceId(targetProjectId) || !Array.isArray(ids) || ids.length > sharedResourceBounds.keys ||
    ids.some(id => !isSharedResourceId(id))) refuse('REQUESTED_IDS')
  const requested = [...new Set(ids)].sort(compare)
  if (!requested.length) return
  await prisma.$transaction(async tx => {
    const budget = { count: 0 }
    const cases = scoped(await tx.testCase.findMany({ where: { id: { in: requested } }, select: caseSelect,
      take: rowLimit + 1 }), targetProjectId, budget)
    if (cases.length !== requested.length || cases.some(row => !requested.includes(row.id))) refuse('CASE_SCOPE')
    if (cases.some(row => row.collaborationManaged))
      throw new ServiceError('Collaboration-managed test cases must be archived, not deleted.', 'CONFLICT', 409)
    const activeIds = cases.filter(row => row.archivedAt === null).map(row => row.id).sort(compare)
    if (!activeIds.length) return
    await deletionReferences(tx, activeIds, targetProjectId, budget)
    const old = await oldRelationships(tx, activeIds, targetProjectId, budget)
    const owned = await children(tx, activeIds, targetProjectId, budget)
    const orphanIds = await orphanIdentifiers(tx, old.tags, activeIds, targetProjectId, budget)
    const deleted = keys(activeIds, [])
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: keys(activeIds, old.suites.map(row => row.id)), newRoots: [], deleted,
    })
    await removeChildren(tx, activeIds, owned)
    const result = await tx.testCase.deleteMany({ where: { id: { in: activeIds }, targetProjectId,
      archivedAt: null, collaborationManaged: false } })
    if (result.count !== activeIds.length) refuse('DELETE_COUNT')
    if (orphanIds.length) {
      const cleanup = await tx.tag.deleteMany({ where: { id: { in: orphanIds }, targetProjectId,
        type: TagType.IDENTIFIER, name: { startsWith: 'tc_' },
        testCases: { none: {} }, testSuites: { none: {} }, testRuns: { none: {} } } })
      if (cleanup.count !== orphanIds.length) refuse('IDENTIFIER_DELETE_COUNT')
    }
  })
}

export async function listTestCases(targetProjectId: string) {
  return prisma.testCase.findMany({
    where: { targetProjectId, archivedAt: null },
    include: {
      steps: {
        include: {
          parameters: true,
        },
      },
      TestSuite: { where: { archivedAt: null } },
      tags: { where: { archivedAt: null } },
    },
  })
}

export async function getTestCaseByIdOrThrow(id: string, targetProjectId: string) {
  const testCase = await prisma.testCase.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: {
      steps: {
        include: {
          parameters: true,
        },
      },
      flowBlocks: {
        include: {
          nodes: true,
        },
      },
      TestSuite: {
        select: {
          id: true,
        },
      },
      tags: {
        select: {
          id: true,
        },
        where: {
          type: TagType.FILTER,
          archivedAt: null,
        },
      },
    },
  })

  if (!testCase) {
    throw new ServiceError('Test case not found', 'NOT_FOUND', 404)
  }

  return {
    ...testCase,
    testSuiteIds: testCase.TestSuite.map(suite => suite.id),
    tagIds: testCase.tags.map(tag => tag.id),
  }
}
