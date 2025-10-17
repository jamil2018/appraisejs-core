import prisma from '@/config/db-config'

/**
 * Represents a module path structure
 */
export interface ModulePath {
  path: string
  name: string
  parentPath?: string
}

/**
 * Creates or finds a module by its path
 * @param modulePath - The module path (e.g., "/module1/submodule")
 * @param moduleName - The name of the module
 * @param parentId - Optional parent module ID
 * @returns Promise<string> - The ID of the created or found module
 */
export async function createOrFindModule(modulePath: string, moduleName: string, parentId?: string): Promise<string> {
  try {
    // First, try to find existing module by name and parent
    const existingModule = await prisma.module.findFirst({
      where: {
        name: moduleName,
        parentId: parentId || null,
      },
    })

    if (existingModule) {
      return existingModule.id
    }

    // Create new module
    const newModule = await prisma.module.create({
      data: {
        name: moduleName,
        parentId: parentId || null,
        // Add description only if it's required by the schema
        // For now, we'll leave it empty since it's optional
      },
    })

    console.log(`Created module: ${moduleName} (${modulePath})`)
    return newModule.id
  } catch (error) {
    console.error(`Error creating module ${moduleName}:`, error)
    throw error
  }
}

/**
 * Builds the complete module hierarchy from a module path
 * @param modulePath - The module path (e.g., "/module1/submodule")
 * @returns Promise<string> - The ID of the leaf module
 */
export async function buildModuleHierarchy(modulePath: string): Promise<string> {
  try {
    // Parse the module path
    const pathParts = modulePath.split('/').filter(part => part && part !== '')

    if (pathParts.length === 0) {
      throw new Error('Invalid module path: empty path')
    }

    let currentParentId: string | undefined
    let currentPath = ''

    // Create or find each module in the hierarchy
    for (let i = 0; i < pathParts.length; i++) {
      const moduleName = pathParts[i]
      currentPath += `/${moduleName}`

      const moduleId = await createOrFindModule(currentPath, moduleName, currentParentId)

      currentParentId = moduleId
    }

    return currentParentId!
  } catch (error) {
    console.error(`Error building module hierarchy for path ${modulePath}:`, error)
    throw error
  }
}

/**
 * Gets all existing modules as a flat list with their paths
 * @returns Promise<Array<{id: string, name: string, path: string, parentId: string | null}>>
 */
export async function getAllModulesWithPaths(): Promise<
  Array<{
    id: string
    name: string
    path: string
    parentId: string | null
  }>
> {
  try {
    const modules = await prisma.module.findMany({
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
export async function findModuleByPath(modulePath: string): Promise<string | null> {
  try {
    const modules = await prisma.module.findMany()
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
