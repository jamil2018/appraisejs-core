import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ServiceError } from '@/services/shared/errors'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { validatePickedLocatorObservation } from '@/lib/locator-picker/selector-observation'
import type { SavePickedLocatorRequest } from '@/types/locator-picker'
import { createLocatorGroup } from '@/services/locator-group/locator-group-service'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import {
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'

type Tx = Prisma.TransactionClient
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const locatorSelect = {
  id: true,
  targetProjectId: true,
  locatorGroupId: true,
  archivedAt: true,
  collaborationManaged: true,
} as const
type LocatorRow = Prisma.LocatorGetPayload<{ select: typeof locatorSelect }>
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Locator mutation requires exact bounded shared-resource effects.', 'CONFLICT', 409, {
    protocol: 'M06_SHARED_LOCATOR_MUTATION_EFFECTS_V1',
    reason,
  })
}

/** Exact read-only endpoint/Case closure; Group/Module FK reads are not effects. */
async function collectLocatorEffects(
  tx: Tx,
  targetProjectId: string,
  locators: readonly LocatorRow[],
  selectedGroupId?: string,
) {
  const keys = new Map<string, SharedResourceMutationKey>()
  let examined = 0
  const take = () => 65_536 - examined + 1
  const rows = <T extends { id: string }>(found: T[]) => {
    if (found.length > 65_536 - examined) refuse('ROWS_UNBOUNDED')
    examined += found.length
    const seen = new Set<string>()
    for (const row of found) {
      if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('ROW_ID_OR_DUPLICATE')
      seen.add(row.id)
    }
    return found
  }
  const exact = (ids: readonly string[], found: readonly { id: string }[]) => {
    const expected = new Set(ids)
    if (found.length !== expected.size || found.some(row => !expected.has(row.id))) refuse('RELATION_ENDPOINT')
  }
  const add = (kind: SharedResourceMutationKey['kind'], resourceId: string) => {
    const id = `${kind}\n${resourceId}`
    if (keys.has(id)) return
    if (keys.size >= sharedResourceBounds.keys) refuse('KEYS_UNBOUNDED')
    keys.set(id, { kind, resourceId })
  }
  for (const row of rows([...locators])) {
    if (
      row.targetProjectId !== targetProjectId ||
      (row.locatorGroupId !== null && !isSharedResourceId(row.locatorGroupId))
    )
      refuse('LOCATOR_SCOPE')
    add('LOCATOR', row.id)
  }
  const groupIds = [
    ...new Set([
      ...locators.flatMap(row => (row.locatorGroupId === null ? [] : [row.locatorGroupId])),
      ...(selectedGroupId === undefined ? [] : [selectedGroupId]),
    ]),
  ].sort(compare)
  if (groupIds.length > sharedResourceBounds.keys || !groupIds.every(isSharedResourceId)) refuse('GROUP_SCOPE')
  if (groupIds.length) {
    const groups = rows(
      await tx.locatorGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, targetProjectId: true, moduleId: true },
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    exact(groupIds, groups)
    if (groups.some(row => row.targetProjectId !== targetProjectId || !isSharedResourceId(row.moduleId)))
      refuse('GROUP_SCOPE')
    const modules = new Map<string, { id: string; parentId: string | null }>()
    let frontier = [...new Set(groups.map(row => row.moduleId))].sort(compare)
    while (frontier.length) {
      if (modules.size + frontier.length > sharedResourceBounds.keys) refuse('MODULE_ANCESTRY_BOUNDS')
      const found = rows(
        await tx.module.findMany({
          where: { id: { in: frontier } },
          select: { id: true, targetProjectId: true, parentId: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      )
      exact(frontier, found)
      for (const row of found) {
        if (row.targetProjectId !== targetProjectId || (row.parentId !== null && !isSharedResourceId(row.parentId)))
          refuse('RELATION_ENDPOINT')
        modules.set(row.id, row)
      }
      frontier = [
        ...new Set(found.flatMap(row => (row.parentId === null || modules.has(row.parentId) ? [] : [row.parentId]))),
      ].sort(compare)
    }
    for (const group of groups) {
      const chain = new Set<string>()
      let id: string | null = group.moduleId
      while (id !== null) {
        if (chain.has(id)) refuse('MODULE_ANCESTRY_CYCLE')
        chain.add(id)
        const ancestorModule: { id: string; parentId: string | null } | undefined = modules.get(id)
        if (!ancestorModule) return refuse('RELATION_ENDPOINT')
        id = ancestorModule.parentId
      }
    }
  }
  const locatorIds = locators.map(row => row.id).sort(compare)
  if (locatorIds.length) {
    const parameters = rows(
      await tx.testCaseStepParameter.findMany({
        where: { locatorId: { in: locatorIds } },
        select: { id: true, locatorId: true, testCaseStepId: true },
        orderBy: { id: 'asc' },
        take: take(),
      }),
    )
    const locatorSet = new Set(locatorIds)
    if (
      parameters.some(
        row => row.locatorId === null || !locatorSet.has(row.locatorId) || !isSharedResourceId(row.testCaseStepId),
      )
    )
      refuse('RELATION_ENDPOINT')
    const stepIds = [...new Set(parameters.map(row => row.testCaseStepId))].sort(compare)
    if (stepIds.length) {
      const steps = rows(
        await tx.testCaseStep.findMany({
          where: { id: { in: stepIds } },
          select: { id: true, testCaseId: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      )
      exact(stepIds, steps)
      if (steps.some(row => !isSharedResourceId(row.testCaseId))) refuse('RELATION_ENDPOINT')
      const caseIds = [...new Set(steps.map(row => row.testCaseId))].sort(compare)
      const cases = rows(
        await tx.testCase.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, targetProjectId: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      )
      exact(caseIds, cases)
      for (const row of cases) {
        if (row.targetProjectId !== targetProjectId) refuse('RELATION_ENDPOINT')
        add('TEST_CASE', row.id)
      }
    }
    if (
      rows(
        await tx.templateTestCaseStepParameter.findMany({
          where: { OR: [{ defaultLocatorId: { in: locatorIds } }, { locatorId: { in: locatorIds } }] },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      ).length
    )
      refuse('TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED')
    if (
      rows(
        await tx.conflictResolution.findMany({
          where: { OR: [{ entityId: { in: locatorIds } }, { conflictingEntityId: { in: locatorIds } }] },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: take(),
        }),
      ).length
    )
      refuse('LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED')
  }
  return [...keys.values()].sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
}

export async function listLocators(targetProjectId: string) {
  return prisma.locator.findMany({
    where: { targetProjectId, archivedAt: null },
    include: {
      locatorGroup: {
        select: {
          name: true,
        },
      },
      conflicts: {
        where: {
          resolved: false,
        },
      },
    },
  })
}

export async function deleteLocators(ids: string[], targetProjectId: string) {
  if (!Array.isArray(ids) || ids.length > sharedResourceBounds.keys || !ids.every(isSharedResourceId))
    refuse('REQUEST_SCOPE_OR_BOUNDS')
  const requested = [...new Set(ids)].sort(compare)
  if (!requested.length) return { count: 0 }
  if (!isSharedResourceId(targetProjectId)) refuse('REQUEST_SCOPE_OR_BOUNDS')
  return prisma.$transaction(async tx => {
    const found = await tx.locator.findMany({
      where: { id: { in: requested } },
      select: locatorSelect,
      orderBy: { id: 'asc' },
      take: requested.length + 1,
    })
    const expected = new Set(requested),
      seen = new Set<string>()
    if (found.length !== requested.length) refuse('REQUEST_SCOPE_OR_BOUNDS')
    for (const row of found) {
      if (!expected.has(row.id) || seen.has(row.id) || row.targetProjectId !== targetProjectId) refuse('LOCATOR_SCOPE')
      seen.add(row.id)
    }
    if (found.some(row => row.collaborationManaged))
      throw new ServiceError('Collaboration-managed locators must be archived, not deleted.', 'CONFLICT', 409)
    const active = found.filter(row => row.archivedAt === null)
    if (!active.length) return { count: 0 }
    const existing = await collectLocatorEffects(tx, targetProjectId, active)
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing,
      newRoots: [],
      deleted: active.map(row => ({ kind: 'LOCATOR', resourceId: row.id })),
    })
    const result = await tx.locator.deleteMany({
      where: {
        id: { in: active.map(row => row.id).sort(compare) },
        targetProjectId,
        archivedAt: null,
        collaborationManaged: false,
      },
    })
    if (result.count !== active.length) refuse('DELETE_COUNT_MISMATCH')
    return result
  })
}

export async function getLocatorByIdOrThrow(id: string, targetProjectId: string) {
  const locator = await prisma.locator.findFirst({
    where: { id, targetProjectId, archivedAt: null },
    include: {
      locatorGroup: {
        select: {
          name: true,
        },
      },
    },
  })

  if (!locator) {
    throw new ServiceError('Locator not found', 'NOT_FOUND', 404)
  }

  return locator
}

export async function detectAndCreateConflicts(
  locatorId: string,
  locatorName: string,
  locatorValue: string,
  locatorGroupId: string,
): Promise<number> {
  let conflictCount = 0

  const existingLocators = await prisma.locator.findMany({
    where: {
      locatorGroupId,
      id: { not: locatorId },
      archivedAt: null,
    },
  })

  for (const existingLocator of existingLocators) {
    if (existingLocator.name === locatorName) {
      const existingConflict = await prisma.conflictResolution.findFirst({
        where: {
          entityType: 'LOCATOR',
          entityId: locatorId,
          conflictType: 'DUPLICATE_NAME',
          conflictingEntityId: existingLocator.id,
          resolved: false,
        },
      })

      if (!existingConflict) {
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: locatorId,
            conflictType: 'DUPLICATE_NAME',
            conflictingEntityId: existingLocator.id,
            resolved: false,
          },
        })
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: existingLocator.id,
            conflictType: 'DUPLICATE_NAME',
            conflictingEntityId: locatorId,
            resolved: false,
          },
        })
        conflictCount++
      }
    } else if (existingLocator.value === locatorValue && existingLocator.name !== locatorName) {
      const existingConflict = await prisma.conflictResolution.findFirst({
        where: {
          entityType: 'LOCATOR',
          entityId: locatorId,
          conflictType: 'DUPLICATE_VALUE',
          conflictingEntityId: existingLocator.id,
          resolved: false,
        },
      })

      if (!existingConflict) {
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: locatorId,
            conflictType: 'DUPLICATE_VALUE',
            conflictingEntityId: existingLocator.id,
            resolved: false,
          },
        })
        await prisma.conflictResolution.create({
          data: {
            entityType: 'LOCATOR',
            entityId: existingLocator.id,
            conflictType: 'DUPLICATE_VALUE',
            conflictingEntityId: locatorId,
            resolved: false,
          },
        })
        conflictCount++
      }
    }
  }

  return conflictCount
}

const savePickedLocatorSchema = z.object({
  locatorId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  locatorName: z.string().min(1, { message: 'Locator name is required.' }),
  selector: z.string().min(1, { message: 'Selector is required.' }),
  resolutionMode: z.enum(['existing', 'create']),
  existingLocatorGroupId: z.string().optional(),
  newLocatorGroupName: z.string().optional(),
  route: z.string().optional(),
  moduleId: z.string().optional(),
})

export type SavePickedLocatorOutcome =
  | {
      kind: 'success'
      locatorId: string
      locatorName: string
      locatorGroupId: string
      locatorGroupName: string
      selector: string
      route: string
      moduleId: string
      message: string
      wasUpdate: boolean
    }
  | { kind: 'error'; status: number; message: string }

export async function savePickedLocatorFromRequest(
  request: SavePickedLocatorRequest,
  targetProjectId: string,
): Promise<SavePickedLocatorOutcome> {
  const value = Object.freeze(savePickedLocatorSchema.parse(request))
  const id = value.locatorId ?? randomUUID()
  if (!isSharedResourceId(targetProjectId)) refuse('REQUEST_SCOPE_OR_BOUNDS')
  const session = value.sessionId ? await locatorPickerSessionManager.getSession(value.sessionId) : null
  const fail = (status: number, message: string): SavePickedLocatorOutcome => ({ kind: 'error', status, message })
  await locatorPickerSessionManager.markSaving(value.sessionId)
  try {
    const locatorName = value.locatorName.trim(),
      selector = value.selector.trim()
    if (session?.pickedLocator) {
      const observationError = validatePickedLocatorObservation(session.pickedLocator, selector)
      if (observationError) return fail(400, observationError)
    }
    if (value.locatorId && !isSharedResourceId(value.locatorId))
      return fail(404, 'The locator you are editing no longer exists.')
    let locatorGroupId = value.existingLocatorGroupId
    if (value.resolutionMode === 'create') {
      // Advisory UX ordering only: retain the early missing-edit check before
      // a separately committed Group create. Final authority is reread below.
      if (
        value.locatorId &&
        !(await prisma.locator.findFirst({
          where: { id: value.locatorId, targetProjectId, archivedAt: null },
          select: { locatorGroupId: true },
        }))
      )
        return fail(404, 'The locator you are editing no longer exists.')
      if (!value.newLocatorGroupName?.trim())
        return fail(400, 'Locator group name is required when creating a new group.')
      if (!value.moduleId) return fail(400, 'Choose a module for the new locator group.')
      try {
        const created = await createLocatorGroup(
          {
            name: value.newLocatorGroupName.trim(),
            moduleId: value.moduleId,
            route: normalizeRoute(value.route || session?.currentPathname),
            locators: [],
          },
          targetProjectId,
        )
        locatorGroupId = created.id
      } catch (error) {
        if (error instanceof ServiceError && error.code === 'VALIDATION') {
          if (error.message === 'Locator group relationships must belong to the active project')
            return fail(404, 'The selected module no longer exists in the active project.')
          if (error.message === 'A locator group with this name already exists. Please choose a different name.')
            return fail(400, 'A locator group with this name already exists. Choose a different name.')
        }
        throw error
      }
    }
    if (!locatorGroupId)
      return fail(
        value.resolutionMode === 'existing' ? 400 : 500,
        value.resolutionMode === 'existing'
          ? 'Choose an existing locator group before saving.'
          : 'Failed to resolve the locator group for saving.',
      )
    if (!isSharedResourceId(locatorGroupId)) return fail(404, 'The selected locator group no longer exists.')
    const selectedGroupId = locatorGroupId
    return await prisma.$transaction(async tx => {
      const current = value.locatorId
        ? await tx.locator.findFirst({
            where: { id: value.locatorId, targetProjectId, archivedAt: null },
            select: locatorSelect,
          })
        : null
      if (
        value.locatorId &&
        (!current ||
          current.id !== value.locatorId ||
          current.targetProjectId !== targetProjectId ||
          current.archivedAt !== null)
      )
        return fail(404, 'The locator you are editing no longer exists.')
      const group = await tx.locatorGroup.findFirst({
        where: { id: selectedGroupId },
        select: { id: true, targetProjectId: true, archivedAt: true, moduleId: true, name: true, route: true },
      })
      if (
        !group ||
        group.id !== selectedGroupId ||
        group.targetProjectId !== targetProjectId ||
        group.archivedAt !== null
      )
        return fail(404, 'The selected locator group no longer exists.')
      if (!isSharedResourceId(group.moduleId)) refuse('RELATION_ENDPOINT')
      const selectedModule = await tx.module.findFirst({
        where: { id: group.moduleId },
        select: { id: true, targetProjectId: true, archivedAt: true },
      })
      if (!selectedModule || selectedModule.id !== group.moduleId || selectedModule.targetProjectId !== targetProjectId)
        refuse('RELATION_ENDPOINT')
      if (value.resolutionMode === 'create' && selectedModule.archivedAt !== null)
        return fail(404, 'The selected module no longer exists in the active project.')
      const duplicate = await tx.locator.findFirst({
        where: {
          locatorGroupId: selectedGroupId,
          name: locatorName,
          targetProjectId,
          archivedAt: null,
          ...(value.locatorId ? { id: { not: value.locatorId } } : {}),
        },
      })
      if (duplicate) return fail(400, `A locator named "${locatorName}" already exists in ${group.name}.`)
      const existing = await collectLocatorEffects(tx, targetProjectId, current ? [current] : [], selectedGroupId)
      await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
        existing,
        newRoots: current ? [] : [{ kind: 'LOCATOR', resourceId: id }],
        deleted: [],
      })
      const data = { name: locatorName, value: selector, locatorGroupId: selectedGroupId, targetProjectId }
      const locator = current
        ? await tx.locator.update({ where: { id }, data })
        : await tx.locator.create({ data: { id, ...data } })
      return {
        kind: 'success',
        locatorId: locator.id,
        locatorName: locator.name,
        locatorGroupId: selectedGroupId,
        locatorGroupName: group.name,
        selector: locator.value,
        route: group.route,
        moduleId: group.moduleId,
        message: value.locatorId ? 'Locator updated successfully.' : 'Locator saved successfully.',
        wasUpdate: Boolean(value.locatorId),
      } satisfies SavePickedLocatorOutcome
    })
  } finally {
    await locatorPickerSessionManager.markReadyAfterSave(value.sessionId)
  }
}
