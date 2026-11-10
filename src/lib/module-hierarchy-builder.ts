import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import type { Module, Prisma, PrismaClient } from '@prisma/client'
import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { ServiceError } from '@/services/shared/errors'

type PlannedModule = Readonly<{
  id: string
  name: string
  parentId: string | null
  targetProjectId: string
  path: string
}>

/** Borrow one complete transaction for the whole insert-only hierarchy. */
export async function buildModuleHierarchyInTransaction(
  modulePath: string,
  targetProjectId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  try {
    if (
      typeof modulePath !== 'string' ||
      modulePath.length > sharedResourceBounds.bytes ||
      !isSharedResourceId(targetProjectId)
    )
      throw new ServiceError('Module hierarchy path or target project is invalid.', 'VALIDATION', 400)
    // Snapshot the complete path before the first asynchronous boundary. Empty
    // paths retain the existing default-root behavior.
    const requestedParts = modulePath.split('/').filter(Boolean)
    const defaultRoot = requestedParts.length === 0
    const pathParts = Object.freeze(defaultRoot ? ['root'] : requestedParts)
    if (pathParts.length > sharedResourceBounds.keys)
      throw new ServiceError('Module hierarchy exceeds the supported resource bound.', 'VALIDATION', 400)
    const planned: PlannedModule[] = []
    const visited = new Set<string>()
    let parentId: string | null = null
    let path = ''
    let missingPrefix = false
    for (const name of pathParts) {
      path += `/${name}`
      // Descendants of a new parent cannot already exist under its fresh ID.
      const existing: Module | null = missingPrefix
        ? null
        : await tx.module.findFirst({
            where: { name, parentId, targetProjectId, archivedAt: null },
          })
      if (existing) {
        if (
          !isSharedResourceId(existing.id) ||
          visited.has(existing.id) ||
          existing.targetProjectId !== targetProjectId ||
          existing.name !== name ||
          existing.parentId !== parentId ||
          existing.archivedAt !== null
        )
          throw new ServiceError('Module hierarchy parent does not match the active target path.', 'CONFLICT', 409)
        visited.add(existing.id)
        parentId = existing.id
        continue
      }
      missingPrefix = true
      const id = randomUUID()
      if (visited.has(id)) throw new ServiceError('Module hierarchy identity collision.', 'CONFLICT', 409)
      visited.add(id)
      planned.push(Object.freeze({ id, name, parentId, targetProjectId, path }))
      parentId = id
    }
    if (!planned.length) return parentId!
    // Existing parents are FK reads only. Prepare the whole new-identity batch
    // before the first resource insert, without claiming existing mutations.
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: [],
      newRoots: planned.map(module => ({ kind: 'MODULE' as const, resourceId: module.id })),
      deleted: [],
    })
    for (const plannedModule of planned) {
      try {
        const created = await tx.module.create({
          data: {
            id: plannedModule.id,
            name: plannedModule.name,
            parentId: plannedModule.parentId,
            targetProjectId: plannedModule.targetProjectId,
          },
        })
        if (created.id !== plannedModule.id)
          throw new ServiceError('Created module does not match its prepared identity.', 'CONFLICT', 409)
        if (defaultRoot) console.log('Created root module for features without module path')
        else console.log(`Created module: ${plannedModule.name} (${plannedModule.path})`)
      } catch (error) {
        if (!defaultRoot) console.error(`Error creating module ${plannedModule.name}:`, error)
        throw error
      }
    }
    return parentId!
  } catch (error) {
    console.error(`Error building module hierarchy for path ${modulePath}:`, error)
    throw error
  }
}

/**
 * Builds the complete module hierarchy from a module path
 * @param modulePath - The module path (e.g., "/module1/submodule")
 * @returns Promise<string> - The ID of the leaf module
 */
export async function buildModuleHierarchy(
  modulePath: string,
  targetProjectId: string,
  client: PrismaClient = prisma,
): Promise<string> {
  return client.$transaction(tx => buildModuleHierarchyInTransaction(modulePath, targetProjectId, tx))
}

/**
 * Gets all existing modules as a flat list with their paths
 * @returns Promise<Array<{id: string, name: string, path: string, parentId: string | null}>>
 */
export async function getAllModulesWithPaths(targetProjectId: string): Promise<
  Array<{
    id: string
    name: string
    path: string
    parentId: string | null
  }>
> {
  try {
    const modules = await prisma.module.findMany({
      where: { targetProjectId, archivedAt: null },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    })

    // Build paths for each module
    const modulesWithPaths = modules.map(module => {
      const path = buildModulePath(modules, module)
      return {
        id: module.id,
        name: module.name,
        path,
        parentId: module.parentId,
      }
    })

    return modulesWithPaths
  } catch (error) {
    console.error('Error fetching modules with paths:', error)
    throw error
  }
}

/**
 * Builds the full path for a module based on its hierarchy
 * @param allModules - All modules from the database
 * @param targetModule - The module to build the path for
 * @returns string - The full module path
 */
function buildModulePath(
  allModules: Array<{ id: string; name: string; parentId: string | null }>,
  targetModule: { id: string; name: string; parentId: string | null },
): string {
  const pathParts: string[] = []
  let currentModule = targetModule

  // Traverse up the hierarchy
  while (currentModule) {
    pathParts.unshift(currentModule.name)

    if (currentModule.parentId) {
      currentModule = allModules.find(m => m.id === currentModule.parentId)!
      if (!currentModule) break
    } else {
      break
    }
  }

  return '/' + pathParts.join('/')
}

/**
 * Finds a module by its path
 * @param modulePath - The module path to find
 * @returns Promise<string | null> - The module ID or null if not found
 */
export async function findModuleByPath(modulePath: string, targetProjectId: string): Promise<string | null> {
  try {
    const modules = await prisma.module.findMany({ where: { targetProjectId, archivedAt: null } })
    const pathParts = modulePath.split('/').filter(part => part && part !== '')

    if (pathParts.length === 0) {
      return null
    }

    // Find the root module
    let currentModule = modules.find(m => m.name === pathParts[0] && !m.parentId)
    if (!currentModule) {
      return null
    }

    // Traverse down the hierarchy
    for (let i = 1; i < pathParts.length; i++) {
      const childModule = modules.find(m => m.name === pathParts[i] && m.parentId === currentModule!.id)

      if (!childModule) {
        return null
      }

      currentModule = childModule
    }

    return currentModule.id
  } catch (error) {
    console.error(`Error finding module by path ${modulePath}:`, error)
    return null
  }
}
