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
import { authoringEditVersion, throwIfStaleAuthoringUpdate } from '@/services/shared/authoring-edit-version'
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
  const input = snapshot(value)
  const id = randomUUID()
  return prisma.$transaction(tx => createTestSuitePreparedInTransaction(tx, input, targetProjectId, id))
}

export async function createTestSuiteInTransaction(
  tx: Tx,
  value: z.infer<typeof testSuiteSchema>,
  targetProjectId: string,
) {
  const input = snapshot(value)
  const id = randomUUID()
  return createTestSuitePreparedInTransaction(tx, input, targetProjectId, id)
}

async function createTestSuitePreparedInTransaction(
  tx: Tx,
  input: z.infer<typeof testSuiteSchema>,
  targetProjectId: string,
  id: string,
) {
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
  expectedUpdatedAt?: string,
): Promise<void> {
  const input = snapshot(value)
  if (!isSharedResourceId(id)) missing()
  await prisma.$transaction(async tx => {
    const suite = await tx.testSuite.findFirst({ where: { id }, select: { ...suiteSelect, updatedAt: true } })
    if (!suite || suite.id !== id || suite.targetProjectId !== targetProjectId || suite.archivedAt !== null) missing()
    const editVersion = authoringEditVersion(suite.updatedAt, expectedUpdatedAt)
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
    try {
      await tx.testSuite.update({
        where: { id, ...(editVersion ? { targetProjectId, archivedAt: null, updatedAt: editVersion.expected } : {}) },
        data: {
          name: input.name,
          description: input.description,
          testCases: { set: input.testCases?.map(testCaseId => ({ id: testCaseId })) },
          tags: { set: [...new Set([identifierId, ...(input.tagIds ?? [])])].map(tagId => ({ id: tagId })) },
          module: { connect: { id: input.moduleId } },
          ...(editVersion ? { updatedAt: editVersion.next } : {}),
        },
      })
    } catch (error) {
      throwIfStaleAuthoringUpdate(error)
    }
  })
}

/** Add one exact attached case while preserving all other authored suite fields and relationships. */
export async function addAttachedCaseToTestSuiteInTransaction(
  tx: Tx,
  input: {
    targetProjectId: string
    testCaseId: string
    expectedCaseTitle: string
    suiteName: string
    moduleName: string
  },
): Promise<{ id: string; name: string; added: boolean }> {
  const selected = await addSelectedCasesToTestSuiteInTransaction(tx, {
    targetProjectId: input.targetProjectId,
    cases: [{ id: input.testCaseId, expectedTitle: input.expectedCaseTitle }],
    suiteName: input.suiteName,
    moduleName: input.moduleName,
  })
  return { id: selected.id, name: selected.name, added: selected.addedCount === 1 }
}

/** Resolve every name before a single guarded membership write in the caller's transaction. */
export async function addNamedCasesToTestSuiteInTransaction(
  tx: Tx,
  input: { targetProjectId: string; caseTitles: readonly string[]; suiteName: string; moduleName: string },
): Promise<{ id: string; name: string; addedCount: number }> {
  const { targetProjectId, suiteName, moduleName } = input
  const caseTitles = Array.isArray(input.caseTitles) ? [...input.caseTitles] : relationships()
  if (
    !isSharedResourceId(targetProjectId) ||
    caseTitles.length < 2 ||
    caseTitles.length > 8 ||
    caseTitles.some(title => typeof title !== 'string' || title.length < 3 || title.length > 512) ||
    new Set(caseTitles).size !== caseTitles.length
  )
    relationships()
  const selected: Array<{ id: string; expectedTitle: string }> = []
  for (const title of caseTitles) {
    const matches = await tx.testCase.findMany({
      where: { targetProjectId, title, archivedAt: null },
      select: { id: true, title: true, targetProjectId: true, archivedAt: true },
      take: 2,
    })
    if (
      matches.length !== 1 ||
      matches[0]!.targetProjectId !== targetProjectId ||
      matches[0]!.archivedAt !== null ||
      matches[0]!.title !== title
    )
      refuse('CASE_TITLE_AMBIGUOUS_OR_MISSING')
    selected.push({ id: matches[0]!.id, expectedTitle: title })
  }
  return addSelectedCasesToTestSuiteInTransaction(tx, { targetProjectId, cases: selected, suiteName, moduleName })
}

async function addSelectedCasesToTestSuiteInTransaction(
  tx: Tx,
  input: {
    targetProjectId: string
    cases: readonly { id: string; expectedTitle: string }[]
    suiteName: string
    moduleName: string
  },
): Promise<{ id: string; name: string; addedCount: number }> {
  const { targetProjectId, suiteName, moduleName } = input
  const selected = input.cases.map(row => ({ id: row.id, expectedTitle: row.expectedTitle }))
  const caseIds = selected.map(row => row.id)
  if (
    !isSharedResourceId(targetProjectId) ||
    !caseIds.length ||
    caseIds.length > 8 ||
    caseIds.some(id => !isSharedResourceId(id)) ||
    new Set(caseIds).size !== caseIds.length ||
    selected.some(
      row => typeof row.expectedTitle !== 'string' || row.expectedTitle.length < 3 || row.expectedTitle.length > 512,
    )
  )
    relationships()
  const cases = await tx.testCase.findMany({
    where: { id: { in: caseIds } },
    select: { id: true, targetProjectId: true, title: true, archivedAt: true },
    take: caseIds.length + 1,
  })
  const titles = new Map(selected.map(row => [row.id, row.expectedTitle]))
  if (
    cases.length !== caseIds.length ||
    cases.some(row => row.targetProjectId !== targetProjectId || row.archivedAt !== null)
  )
    relationships()
  if (cases.some(row => row.title !== titles.get(row.id)))
    throw new ServiceError(
      'A selected case changed. Review its current title before changing suite membership.',
      'CONFLICT',
      409,
    )
  const modules = await tx.module.findMany({
    where: { targetProjectId, name: moduleName, archivedAt: null },
    select: { id: true },
    take: 2,
  })
  if (modules.length !== 1) refuse('MODULE_NAME_AMBIGUOUS_OR_MISSING')
  const moduleId = modules[0]!.id
  await validateModule(tx, moduleId, targetProjectId)
  const suites = await tx.testSuite.findMany({
    where: { targetProjectId, moduleId, name: suiteName, archivedAt: null },
    select: { ...suiteSelect, name: true, updatedAt: true },
    take: 2,
  })
  if (suites.length !== 1) refuse('SUITE_NAME_AMBIGUOUS_OR_MISSING')
  const suite = suites[0]!
  if (!isSharedResourceId(suite.id) || suite.targetProjectId !== targetProjectId || suite.archivedAt !== null)
    refuse('SUITE_SCOPE')
  await suiteTags(tx, [suite.id], targetProjectId)
  const oldMembers = await members(tx, [suite.id], targetProjectId)
  const existing = keys([suite.id], [...oldMembers.map(row => row.id), ...caseIds])
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing, newRoots: [], deleted: [] })
  const oldIds = new Set(oldMembers.map(row => row.id))
  const newIds = caseIds.filter(id => !oldIds.has(id))
  if (!newIds.length) return { id: suite.id, name: suite.name, addedCount: 0 }
  const editVersion = authoringEditVersion(suite.updatedAt, suite.updatedAt.toISOString())!
  try {
    await tx.testSuite.update({
      where: {
        id: suite.id,
        targetProjectId,
        moduleId,
        name: suiteName,
        archivedAt: null,
        updatedAt: editVersion.expected,
      },
      data: { testCases: { connect: newIds.map(id => ({ id })) }, updatedAt: editVersion.next },
    })
  } catch (error) {
    throwIfStaleAuthoringUpdate(error)
  }
  return { id: suite.id, name: suite.name, addedCount: newIds.length }
}

/** Rename only a uniquely identified active suite while retaining its module, members, tags, and history. */
export async function renameExactTestSuiteInTransaction(
  tx: Tx,
  input: { targetProjectId: string; currentName: string; moduleName: string; nextName: string },
): Promise<{ id: string; name: string }> {
  const { targetProjectId, currentName, moduleName, nextName } = input
  if (!isSharedResourceId(targetProjectId) || currentName === nextName) relationships()
  const modules = await tx.module.findMany({
    where: { targetProjectId, name: moduleName, archivedAt: null },
    select: { id: true },
    take: 2,
  })
  if (modules.length !== 1) refuse('MODULE_NAME_AMBIGUOUS_OR_MISSING')
  const moduleId = modules[0]!.id
  await validateModule(tx, moduleId, targetProjectId)
  const suites = await tx.testSuite.findMany({
    where: { targetProjectId, moduleId, name: currentName, archivedAt: null },
    select: { ...suiteSelect, updatedAt: true },
    take: 2,
  })
  if (suites.length !== 1) refuse('SUITE_NAME_AMBIGUOUS_OR_MISSING')
  const suite = suites[0]!
  if (!isSharedResourceId(suite.id) || suite.targetProjectId !== targetProjectId || suite.archivedAt !== null)
    refuse('SUITE_SCOPE')
  const collision = await tx.testSuite.findFirst({
    where: { targetProjectId, moduleId, name: nextName, archivedAt: null },
    select: { id: true },
  })
  if (collision) refuse('NEXT_SUITE_NAME_EXISTS')
  await suiteTags(tx, [suite.id], targetProjectId)
  const oldMembers = await members(tx, [suite.id], targetProjectId)
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
    existing: keys(
      [suite.id],
      oldMembers.map(row => row.id),
    ),
    newRoots: [],
    deleted: [],
  })
  const editVersion = authoringEditVersion(suite.updatedAt, suite.updatedAt.toISOString())!
  const result = await tx.testSuite.updateMany({
    where: {
      id: suite.id,
      targetProjectId,
      moduleId,
      name: currentName,
      archivedAt: null,
      updatedAt: editVersion.expected,
    },
    data: { name: nextName, updatedAt: editVersion.next },
  })
  if (result.count !== 1)
    throw new ServiceError('The test suite changed. Review it again before renaming.', 'CONFLICT', 409)
  return { id: suite.id, name: nextName }
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
