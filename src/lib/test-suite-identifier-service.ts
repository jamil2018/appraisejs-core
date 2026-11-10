import prisma from '@/config/db-config'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { getIdentifierTagByPrefix } from '@/lib/tag-filters'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { ServiceError } from '@/services/shared/errors'
import { TagType } from '@prisma/client'

const rowLimit = 65_536
const refuse: (reason: string) => never = reason => {
  throw new ServiceError(
    'Test suite identifier repair requires exact bounded shared-resource effects.',
    'CONFLICT',
    409,
    {
      protocol: 'M06_TEST_SUITE_IDENTIFIER_REPAIR_V1',
      reason,
    },
  )
}

async function repairIdentifiers(testSuiteIds: string[] | undefined, targetProjectId: string) {
  if (
    !isSharedResourceId(targetProjectId) ||
    (testSuiteIds !== undefined &&
      (!Array.isArray(testSuiteIds) ||
        testSuiteIds.length > sharedResourceBounds.keys ||
        testSuiteIds.some(id => !isSharedResourceId(id))))
  )
    refuse('REQUESTED_SCOPE')
  const requested = testSuiteIds === undefined ? undefined : [...new Set(testSuiteIds)].sort()
  if (requested?.length === 0) return new Map<string, string>()
  return prisma.$transaction(async tx => {
    // Explicit seeds are unfiltered: a target predicate must not conceal a foreign row.
    const suites = await tx.testSuite.findMany({
      where: requested === undefined ? { targetProjectId, archivedAt: null } : { id: { in: requested } },
      select: { id: true, targetProjectId: true, moduleId: true, archivedAt: true },
      orderBy: { id: 'asc' },
      take: sharedResourceBounds.keys + 1,
    })
    if (suites.length > sharedResourceBounds.keys) refuse('SUITE_BOUND')
    const seen = new Set<string>(),
      identifiers = new Map<string, string>()
    const missing: string[] = []
    let examined = 0
    for (const suite of suites) {
      if (
        !isSharedResourceId(suite.id) ||
        seen.has(suite.id) ||
        suite.targetProjectId !== targetProjectId ||
        (requested && !requested.includes(suite.id))
      )
        refuse('SUITE_SCOPE')
      seen.add(suite.id)
      if (suite.archivedAt !== null) continue
      const tags = await tx.tag.findMany({
        where: { testSuites: { some: { id: suite.id } } },
        select: { id: true, targetProjectId: true, name: true, tagExpression: true, type: true },
        orderBy: { id: 'asc' },
        take: rowLimit - examined + 1,
      })
      examined += tags.length
      if (examined > rowLimit) refuse('TAG_BOUND')
      const tagIds = new Set<string>()
      for (const tag of tags) {
        if (
          !isSharedResourceId(tag.id) ||
          tagIds.has(tag.id) ||
          tag.targetProjectId !== targetProjectId ||
          typeof tag.name !== 'string' ||
          typeof tag.tagExpression !== 'string' ||
          (tag.type !== TagType.IDENTIFIER && tag.type !== TagType.FILTER)
        )
          refuse('TAG_SCOPE')
        tagIds.add(tag.id)
      }
      const identifier = getIdentifierTagByPrefix(tags, 'ts_')
      if (identifier) {
        identifiers.set(suite.id, identifier.id)
        continue
      }
      if (!isSharedResourceId(suite.moduleId)) refuse('MODULE_ENDPOINT')
      const suiteModule = await tx.module.findFirst({
        where: { id: suite.moduleId },
        select: { id: true, targetProjectId: true },
      })
      if (!suiteModule || suiteModule.id !== suite.moduleId || suiteModule.targetProjectId !== targetProjectId)
        refuse('MODULE_ENDPOINT')
      const members = await tx.testCase.findMany({
        where: { TestSuite: { some: { id: suite.id } } },
        select: { id: true, targetProjectId: true },
        take: rowLimit - examined + 1,
      })
      examined += members.length
      if (examined > rowLimit) refuse('MEMBER_BOUND')
      const memberIds = new Set<string>()
      for (const member of members) {
        if (!isSharedResourceId(member.id) || memberIds.has(member.id) || member.targetProjectId !== targetProjectId)
          refuse('MEMBER_SCOPE')
        memberIds.add(member.id)
      }
      missing.push(suite.id)
    }
    if (requested && requested.some(id => !seen.has(id)))
      throw new ServiceError('Test suite not found', 'NOT_FOUND', 404)
    if (!missing.length) return identifiers
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: missing.sort().map(resourceId => ({ kind: 'TEST_SUITE', resourceId })),
      newRoots: [],
      deleted: [],
    })
    for (const id of missing) {
      const name = generateUniqueTestSuiteIdentifier()
      const tag = await tx.tag.create({
        data: { name, type: TagType.IDENTIFIER, tagExpression: `@${name}`, targetProjectId },
      })
      await tx.testSuite.update({ where: { id }, data: { tags: { connect: { id: tag.id } } } })
      identifiers.set(id, tag.id)
    }
    return identifiers
  })
}

export async function ensureTestSuiteIdentifierTags(
  testSuiteIds: string[] | undefined,
  targetProjectId: string,
): Promise<void> {
  await repairIdentifiers(testSuiteIds, targetProjectId)
}

export async function getOrCreateTestSuiteIdentifierTagId(
  testSuiteId: string,
  targetProjectId: string,
): Promise<string> {
  const identifiers = await repairIdentifiers([testSuiteId], targetProjectId)
  const identifier = identifiers.get(testSuiteId)
  if (!identifier) throw new Error(`Unable to resolve identifier tag for test suite ${testSuiteId}`)
  return identifier
}
