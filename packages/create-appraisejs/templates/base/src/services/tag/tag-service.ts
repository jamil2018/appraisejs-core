import prisma from '@/config/db-config'
import type { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { authoringEditVersion, throwIfStaleAuthoringUpdate } from '@/services/shared/authoring-edit-version'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import {
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { TagType, type Prisma, type Tag } from '@prisma/client'
import type { z } from 'zod'

type Tx = Prisma.TransactionClient
type Examined = { count: number }
const rowLimit = 65_536
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const tagSelect = {
  id: true,
  targetProjectId: true,
  archivedAt: true,
  collaborationManaged: true,
  name: true,
  tagExpression: true,
} as const
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Tag mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_TAG_MUTATION_EFFECTS_V1',
    reason,
  })
}
function scoped<T extends { id: string; targetProjectId: string }>(
  rows: T[],
  targetProjectId: string,
  budget: Examined,
) {
  budget.count += rows.length
  if (budget.count > rowLimit) refuse('ROW_BOUND')
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isSharedResourceId(row.id) || seen.has(row.id) || row.targetProjectId !== targetProjectId)
      refuse('RELATED_SCOPE')
    seen.add(row.id)
  }
  return rows
}
function snapshot(value: z.infer<typeof tagSchema>, targetProjectId: string) {
  if (!isSharedResourceId(targetProjectId)) refuse('TARGET_SCOPE')
  return { name: value.name, tagExpression: value.tagExpression }
}
async function effects(tx: Tx, ids: string[], targetProjectId: string, budget: Examined) {
  // Reverse endpoints are intentionally unfiltered, including archived authored rows.
  const cases = scoped(
    await tx.testCase.findMany({
      where: { tags: { some: { id: { in: ids } } } },
      select: { id: true, targetProjectId: true },
      orderBy: { id: 'asc' },
      take: rowLimit - budget.count + 1,
    }),
    targetProjectId,
    budget,
  )
  const suites = scoped(
    await tx.testSuite.findMany({
      where: { tags: { some: { id: { in: ids } } } },
      select: { id: true, targetProjectId: true, moduleId: true },
      orderBy: { id: 'asc' },
      take: rowLimit - budget.count + 1,
    }),
    targetProjectId,
    budget,
  )
  const existing: SharedResourceMutationKey[] = [
    ...cases.map(row => ({ kind: 'TEST_CASE' as const, resourceId: row.id })),
    ...suites.map(row => ({ kind: 'TEST_SUITE' as const, resourceId: row.id })),
  ].sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
  if (existing.length > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
  // A Suite's Module FK is validated read-only; changing a Tag does not mutate that Module.
  const moduleIds = [...new Set(suites.map(row => row.moduleId))]
  if (moduleIds.some(id => !isSharedResourceId(id))) refuse('MODULE_ENDPOINT')
  if (moduleIds.length) {
    const modules = scoped(
      await tx.module.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true, targetProjectId: true },
        take: rowLimit - budget.count + 1,
      }),
      targetProjectId,
      budget,
    )
    if (modules.length !== moduleIds.length || modules.some(row => !moduleIds.includes(row.id)))
      refuse('MODULE_ENDPOINT')
  }
  const runs = scoped(
    await tx.testRun.findMany({
      where: { tags: { some: { id: { in: ids } } } },
      select: { id: true, targetProjectId: true },
      orderBy: { id: 'asc' },
      take: rowLimit - budget.count + 1,
    }),
    targetProjectId,
    budget,
  )
  return { existing, runs }
}

async function checkUniqueTagName(tx: Tx, name: string, targetProjectId: string, excludeId?: string): Promise<boolean> {
  const existing = await tx.tag.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })

  return !!existing
}

async function checkUniqueTagExpression(
  tx: Tx,
  tagExpression: string,
  targetProjectId: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await tx.tag.findFirst({
    where: {
      tagExpression,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })

  return !!existing
}

export async function listFilterTags(targetProjectId: string): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: { type: TagType.FILTER, targetProjectId, archivedAt: null },
  })
}

export async function deleteTags(ids: string[], targetProjectId: string): Promise<void> {
  if (
    !isSharedResourceId(targetProjectId) ||
    !Array.isArray(ids) ||
    ids.length > sharedResourceBounds.keys ||
    ids.some(id => !isSharedResourceId(id))
  )
    refuse('REQUESTED_IDS')
  const requested = [...new Set(ids)].sort(compare)
  if (!requested.length) return
  await prisma.$transaction(async tx => {
    const budget = { count: 0 }
    const tags = scoped(
      await tx.tag.findMany({ where: { id: { in: requested } }, select: tagSelect, take: rowLimit + 1 }),
      targetProjectId,
      budget,
    )
    if (tags.length !== requested.length || tags.some(tag => !requested.includes(tag.id))) refuse('TAG_SCOPE')
    if (tags.some(tag => tag.collaborationManaged))
      throw new ServiceError('Collaboration-managed tags must be archived, not deleted.', 'CONFLICT', 409)
    const activeIds = tags
      .filter(tag => tag.archivedAt === null)
      .map(tag => tag.id)
      .sort(compare)
    if (!activeIds.length) return
    const closure = await effects(tx, activeIds, targetProjectId, budget)
    // Physical deletion would erase implicit historical run-tag edges, which are not supported effects.
    if (closure.runs.length) refuse('HISTORICAL_RUN_REFERENCE')
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: closure.existing,
      newRoots: [],
      deleted: [],
    })
    const result = await tx.tag.deleteMany({
      where: { id: { in: activeIds }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
    if (result.count !== activeIds.length) refuse('DELETE_COUNT')
  })
}

export async function createTag(value: z.infer<typeof tagSchema>, targetProjectId: string): Promise<Tag> {
  return prisma.$transaction(tx => createTagInTransaction(tx, value, targetProjectId))
}

export async function createTagInTransaction(
  tx: Tx,
  value: z.infer<typeof tagSchema>,
  targetProjectId: string,
): Promise<Tag> {
  const input = snapshot(value, targetProjectId)
  const tagNameExists = await checkUniqueTagName(tx, input.name, targetProjectId)
  if (tagNameExists) {
    throw new ServiceError(
      'A tag with this name already exists. Please choose a different tag name.',
      'VALIDATION',
      400,
    )
  }

  const tagExpressionExists = await checkUniqueTagExpression(tx, input.tagExpression, targetProjectId)
  if (tagExpressionExists) {
    throw new ServiceError(
      'A tag with this tag expression already exists. Please choose a different tag expression.',
      'VALIDATION',
      400,
    )
  }

  // A new unbound Tag changes no existing Case or Suite descriptor and has no Tag guard domain.
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: [], newRoots: [], deleted: [] })
  return tx.tag.create({ data: { ...input, targetProjectId } })
}

export async function getTagByIdOrThrow(id: string, targetProjectId: string): Promise<Tag> {
  const tag = await prisma.tag.findFirst({ where: { id, targetProjectId, archivedAt: null } })
  if (!tag) {
    throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
  }
  return tag
}

export async function updateTag(
  id: string | undefined,
  value: z.infer<typeof tagSchema>,
  targetProjectId: string,
  expectedUpdatedAt?: string,
): Promise<Tag> {
  if (!id) {
    throw new ServiceError('Tag id is required', 'VALIDATION', 400)
  }
  const input = snapshot(value, targetProjectId)
  if (!isSharedResourceId(id)) throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
  return prisma.$transaction(async tx => {
    const currentTag = await tx.tag.findFirst({ where: { id }, select: { ...tagSelect, updatedAt: true } })
    if (
      !currentTag ||
      currentTag.id !== id ||
      currentTag.targetProjectId !== targetProjectId ||
      currentTag.archivedAt !== null
    )
      throw new ServiceError('Tag not found', 'NOT_FOUND', 404)
    const editVersion = authoringEditVersion(currentTag.updatedAt, expectedUpdatedAt)
    const budget = { count: 0 }
    scoped([currentTag], targetProjectId, budget)
    if (currentTag.name !== input.name) {
      const tagNameExists = await checkUniqueTagName(tx, input.name, targetProjectId, id)
      if (tagNameExists) {
        throw new ServiceError(
          'A tag with this name already exists. Please choose a different tag name.',
          'VALIDATION',
          400,
        )
      }
    }
    if (currentTag.tagExpression !== input.tagExpression) {
      const tagExpressionExists = await checkUniqueTagExpression(tx, input.tagExpression, targetProjectId, id)
      if (tagExpressionExists) {
        throw new ServiceError(
          'A tag with this tag expression already exists. Please choose a different tag expression.',
          'VALIDATION',
          400,
        )
      }
    }
    const closure = await effects(tx, [id], targetProjectId, budget)
    // Renaming changes no run-tag edges; scoped historical display is not a mutation authority.
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: closure.existing,
      newRoots: [],
      deleted: [],
    })
    try {
      return await tx.tag.update({
        where: { id, ...(editVersion ? { targetProjectId, archivedAt: null, updatedAt: editVersion.expected } : {}) },
        data: { ...input, ...(editVersion ? { updatedAt: editVersion.next } : {}) },
      })
    } catch (error) {
      throwIfStaleAuthoringUpdate(error)
    }
  })
}

/** Rename one exact active filter tag without changing its expression or authored relationships. */
export async function renameExactFilterTagInTransaction(
  tx: Tx,
  input: { targetProjectId: string; currentName: string; tagExpression: string; nextName: string },
): Promise<{ id: string; name: string }> {
  const { targetProjectId, currentName, tagExpression, nextName } = input
  if (!isSharedResourceId(targetProjectId) || currentName === nextName) refuse('TAG_RENAME_REQUEST')
  const matches = await tx.tag.findMany({
    where: { targetProjectId, name: currentName, tagExpression, type: TagType.FILTER, archivedAt: null },
    select: { ...tagSelect, type: true, updatedAt: true },
    take: 2,
  })
  if (matches.length !== 1) refuse('TAG_NAME_EXPRESSION_AMBIGUOUS_OR_MISSING')
  const tag = matches[0]!
  const budget = { count: 0 }
  scoped([tag], targetProjectId, budget)
  if (tag.archivedAt !== null || tag.type !== TagType.FILTER) refuse('TAG_SCOPE')
  if (await checkUniqueTagName(tx, nextName, targetProjectId, tag.id))
    throw new ServiceError(
      'A tag with this name already exists. Please choose a different tag name.',
      'VALIDATION',
      400,
    )
  const closure = await effects(tx, [tag.id], targetProjectId, budget)
  await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
    existing: closure.existing,
    newRoots: [],
    deleted: [],
  })
  const editVersion = authoringEditVersion(tag.updatedAt, tag.updatedAt.toISOString())!
  const changed = await tx.tag.updateMany({
    where: {
      id: tag.id,
      targetProjectId,
      name: currentName,
      tagExpression,
      type: TagType.FILTER,
      archivedAt: null,
      updatedAt: editVersion.expected,
    },
    data: { name: nextName, updatedAt: editVersion.next },
  })
  if (changed.count !== 1) throw new ServiceError('The tag changed. Review it again before renaming.', 'CONFLICT', 409)
  return { id: tag.id, name: nextName }
}
