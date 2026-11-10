import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { getIdentifierTagByPrefix } from '@/lib/tag-filters'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import {
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { ServiceError } from '@/services/shared/errors'
import { TagType, type Prisma } from '@prisma/client'
import type { z } from 'zod'

type Tx = Prisma.TransactionClient
const rowLimit = 65_536
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const suiteSelect = {
  id: true,
  targetProjectId: true,
  moduleId: true,
  archivedAt: true,
  collaborationManaged: true,
} as const
const tagSelect = {
  id: true,
  targetProjectId: true,
  name: true,
  tagExpression: true,
  type: true,
  archivedAt: true,
} as const
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Test suite mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_TEST_SUITE_MUTATION_EFFECTS_V1',
    reason,
  })
}
const relationships: () => never = () => {
  throw new ServiceError('Test suite relationships must belong to the active project', 'VALIDATION', 400)
}
const missing: () => never = () => {
  throw new ServiceError('Test suite not found', 'NOT_FOUND', 404)
}

function inputIds(ids: string[] | undefined) {
  if (ids === undefined) return undefined
  if (
    !Array.isArray(ids) ||
    ids.length > sharedResourceBounds.keys ||
    ids.some(id => !isSharedResourceId(id)) ||
    new Set(ids).size !== ids.length
  )
    relationships()
  return [...ids]
}
function snapshot(value: z.infer<typeof testSuiteSchema>) {
  return { ...value, testCases: inputIds(value.testCases), tagIds: inputIds(value.tagIds) }
}
function scoped<T extends { id: string; targetProjectId: string }>(rows: T[], targetProjectId: string) {
  if (rows.length > rowLimit) refuse('ROW_BOUND')
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isSharedResourceId(row.id) || seen.has(row.id) || row.targetProjectId !== targetProjectId)
      refuse('RELATED_SCOPE')
    seen.add(row.id)
  }
  return rows
}
function keys(suiteIds: string[], caseIds: string[]): SharedResourceMutationKey[] {
  const rows: SharedResourceMutationKey[] = [
    ...[...new Set(suiteIds)].map(resourceId => ({ kind: 'TEST_SUITE' as const, resourceId })),
    ...[...new Set(caseIds)].map(resourceId => ({ kind: 'TEST_CASE' as const, resourceId })),
  ]
  if (rows.length > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
  return rows.sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
}
async function validateModule(tx: Tx, moduleId: string, targetProjectId: string) {
  if (!isSharedResourceId(moduleId) || !isSharedResourceId(targetProjectId)) relationships()
  const selectedModule = await tx.module.findFirst({
    where: { id: moduleId },
    select: { id: true, targetProjectId: true, archivedAt: true },
  })
  if (
    !selectedModule ||
    selectedModule.id !== moduleId ||
    selectedModule.targetProjectId !== targetProjectId ||
    selectedModule.archivedAt !== null
  )
    relationships()
}
async function validateOldModule(tx: Tx, moduleId: string, targetProjectId: string) {
  if (!isSharedResourceId(moduleId)) refuse('MODULE_ENDPOINT')
  const previousModule = await tx.module.findFirst({
    where: { id: moduleId },
    select: { id: true, targetProjectId: true },
  })
  if (!previousModule || previousModule.id !== moduleId || previousModule.targetProjectId !== targetProjectId)
    refuse('MODULE_ENDPOINT')
}
async function suppliedRelationships(tx: Tx, value: z.infer<typeof testSuiteSchema>, targetProjectId: string) {
  await validateModule(tx, value.moduleId, targetProjectId)
  if (value.testCases?.length) {
    const rows = await tx.testCase.findMany({
      where: { id: { in: value.testCases } },
      select: { id: true, targetProjectId: true, archivedAt: true },
      take: rowLimit + 1,
    })
    if (
      rows.length !== value.testCases.length ||
      new Set(rows.map(row => row.id)).size !== rows.length ||
      rows.some(
        row => !value.testCases!.includes(row.id) || row.targetProjectId !== targetProjectId || row.archivedAt !== null,
      )
    )
      relationships()
  }
  if (value.tagIds?.length) {
    const rows = await tx.tag.findMany({ where: { id: { in: value.tagIds } }, select: tagSelect, take: rowLimit + 1 })
    if (
      rows.length !== value.tagIds.length ||
      new Set(rows.map(row => row.id)).size !== rows.length ||
      rows.some(
        row =>
          !value.tagIds!.includes(row.id) ||
          row.targetProjectId !== targetProjectId ||
          row.archivedAt !== null ||
          (row.type !== TagType.IDENTIFIER && row.type !== TagType.FILTER),
      )
    )
      relationships()
  }
}
async function suiteTags(tx: Tx, suiteIds: string[], targetProjectId: string) {
  const tags = scoped(
    await tx.tag.findMany({
      where: { testSuites: { some: { id: { in: suiteIds } } } },
      select: tagSelect,
      orderBy: { id: 'asc' },
      take: rowLimit + 1,
    }),
    targetProjectId,
  )
  if (
    tags.some(
      tag =>
        (tag.type !== TagType.IDENTIFIER && tag.type !== TagType.FILTER) ||
        typeof tag.name !== 'string' ||
        typeof tag.tagExpression !== 'string',
    )
  )
    refuse('TAG_TYPE')
  return tags
}
async function members(tx: Tx, suiteIds: string[], targetProjectId: string) {
  return scoped(
    await tx.testCase.findMany({
      where: { TestSuite: { some: { id: { in: suiteIds } } } },
      select: { id: true, targetProjectId: true },
      orderBy: { id: 'asc' },
      take: rowLimit + 1,
    }),
    targetProjectId,
  )
}
async function createIdentifier(tx: Tx, targetProjectId: string) {
  const name = generateUniqueTestSuiteIdentifier()
  return tx.tag.create({ data: { name, type: TagType.IDENTIFIER, tagExpression: `@${name}`, targetProjectId } })
}

export async function listTestSuites(targetProjectId: string) {
  await ensureTestSuiteIdentifierTags(undefined, targetProjectId)
  return prisma.testSuite.findMany({
    where: { targetProjectId, archivedAt: null, module: { is: { archivedAt: null } } },
    include: { module: true, testCases: { where: { archivedAt: null } }, tags: { where: { archivedAt: null } } },
  })
}

export async function createTestSuiteFromInput(value: z.infer<typeof testSuiteSchema>, targetProjectId: string) {
  const input = snapshot(value),
    id = randomUUID()
  return prisma.$transaction(async tx => {
    await suppliedRelationships(tx, input, targetProjectId)
    const existing = keys([], input.testCases ?? [])
    if (existing.length + 1 > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing,
      newRoots: [{ kind: 'TEST_SUITE', resourceId: id }],
      deleted: [],
    })
    const identifier = await createIdentifier(tx, targetProjectId)
    return tx.testSuite.create({
      data: {
        id,
        name: input.name,
        description: input.description,
        targetProject: { connect: { id: targetProjectId } },
        module: { connect: { id: input.moduleId } },
        testCases: { connect: input.testCases?.map(resourceId => ({ id: resourceId })) },
        tags: { connect: [identifier.id, ...(input.tagIds ?? [])].map(tagId => ({ id: tagId })) },
      },
    })
  })
}

export async function getTestSuiteByIdOrThrow(id: string, targetProjectId: string) {
  await ensureTestSuiteIdentifierTags([id], targetProjectId)
  const suite = await prisma.testSuite.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: { module: true, testCases: true, tags: { where: { type: TagType.FILTER, archivedAt: null } } },
  })
  if (!suite) missing()
  return suite
}

export async function updateTestSuiteFromInput(
  value: z.infer<typeof testSuiteSchema>,
  id: string,
  targetProjectId: string,
): Promise<void> {
  const input = snapshot(value)
  if (!isSharedResourceId(id)) missing()
  await prisma.$transaction(async tx => {
    const suite = await tx.testSuite.findFirst({ where: { id }, select: suiteSelect })
    if (!suite || suite.id !== id || suite.targetProjectId !== targetProjectId || suite.archivedAt !== null) missing()
    await validateOldModule(tx, suite.moduleId, targetProjectId)
    await suppliedRelationships(tx, input, targetProjectId)
    const tags = await suiteTags(tx, [id], targetProjectId)
    const oldMembers = await members(tx, [id], targetProjectId)
    const existing = keys(
      [id],
      input.testCases === undefined ? [] : [...oldMembers.map(row => row.id), ...input.testCases],
    )
    const identifier = getIdentifierTagByPrefix(tags, 'ts_')
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing, newRoots: [], deleted: [] })
    const identifierId = identifier?.id ?? (await createIdentifier(tx, targetProjectId)).id
    await tx.testSuite.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        testCases: { set: input.testCases?.map(testCaseId => ({ id: testCaseId })) },
        tags: { set: [...new Set([identifierId, ...(input.tagIds ?? [])])].map(tagId => ({ id: tagId })) },
        module: { connect: { id: input.moduleId } },
      },
    })
  })
}

export async function deleteTestSuitesByIds(ids: string[], targetProjectId: string): Promise<void> {
  if (!Array.isArray(ids) || ids.length > sharedResourceBounds.keys || ids.some(id => !isSharedResourceId(id)))
    refuse('REQUESTED_IDS')
  const requested = [...new Set(ids)].sort(compare)
  if (!requested.length) return
  await prisma.$transaction(async tx => {
    const suites = scoped(
      await tx.testSuite.findMany({ where: { id: { in: requested } }, select: suiteSelect, take: rowLimit + 1 }),
      targetProjectId,
    )
    if (suites.length !== requested.length || suites.some(row => !requested.includes(row.id))) refuse('SUITE_SCOPE')
    if (suites.some(row => row.collaborationManaged))
      throw new ServiceError('Collaboration-managed test suites must be archived, not deleted.', 'CONFLICT', 409)
    const active = suites.filter(row => row.archivedAt === null),
      activeIds = active.map(row => row.id).sort(compare)
    if (!activeIds.length) return
    for (const suite of active) await validateOldModule(tx, suite.moduleId, targetProjectId)
    const history = await tx.testRunTestCase.findFirst({
      where: { testSuiteId: { in: activeIds } },
      select: { id: true },
    })
    if (history) refuse('HISTORICAL_SUITE_REFERENCE')
    const oldMembers = await members(tx, activeIds, targetProjectId)
    const tags = await suiteTags(tx, activeIds, targetProjectId)
    const candidateIds = tags
      .filter(tag => tag.type === TagType.IDENTIFIER && tag.name.startsWith('ts_'))
      .map(tag => tag.id)
    if (candidateIds.length > sharedResourceBounds.keys) refuse('IDENTIFIER_TAG_BOUND')
    const orphanIds: string[] = []
    let examined = 0
    // Incoming references are unfiltered and scoped before any resource or relationship writer.
    for (const tagId of candidateIds) {
      const tag = await tx.tag.findFirst({
        where: { id: tagId },
        select: {
          ...tagSelect,
          testSuites: { select: { id: true, targetProjectId: true }, take: rowLimit - examined + 1 },
          testCases: { select: { id: true, targetProjectId: true }, take: rowLimit - examined + 1 },
          testRuns: { select: { id: true, targetProjectId: true }, take: rowLimit - examined + 1 },
        },
      })
      if (
        !tag ||
        tag.id !== tagId ||
        tag.targetProjectId !== targetProjectId ||
        tag.type !== TagType.IDENTIFIER ||
        !tag.name.startsWith('ts_')
      )
        refuse('IDENTIFIER_TAG_SCOPE')
      scoped(tag.testSuites, targetProjectId)
      scoped(tag.testCases, targetProjectId)
      scoped(tag.testRuns, targetProjectId)
      examined += tag.testSuites.length + tag.testCases.length + tag.testRuns.length
      if (examined > rowLimit) refuse('ROW_BOUND')
      if (!tag.testCases.length && !tag.testRuns.length && tag.testSuites.every(row => activeIds.includes(row.id)))
        orphanIds.push(tagId)
    }
    const deleted = keys(activeIds, [])
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: keys(
        activeIds,
        oldMembers.map(row => row.id),
      ),
      newRoots: [],
      deleted,
    })
    const result = await tx.testSuite.deleteMany({
      where: { id: { in: activeIds }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
    if (result.count !== activeIds.length) refuse('DELETE_COUNT')
    if (orphanIds.length) {
      const cleanup = await tx.tag.deleteMany({
        where: {
          id: { in: orphanIds },
          targetProjectId,
          type: TagType.IDENTIFIER,
          name: { startsWith: 'ts_' },
          testSuites: { none: {} },
          testCases: { none: {} },
          testRuns: { none: {} },
        },
      })
      if (cleanup.count !== orphanIds.length) refuse('IDENTIFIER_DELETE_COUNT')
    }
  })
}
