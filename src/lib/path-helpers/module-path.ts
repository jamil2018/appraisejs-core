import { Module } from '@prisma/client'

/**
 * Builds the hierarchical path for a module based on its parent modules
 * @param modules - Array of all modules
 * @param selectedModule - The module to get the path for
 * @returns The hierarchical path as a string (e.g., "/user/user profile")
 */
export function buildModulePath(modules: Module[], selectedModule: Module): string {
  const path: string[] = []
  let currentModule: Module | null = selectedModule

  // Build path from current module up to root
  while (currentModule) {
    path.unshift(currentModule.name)
    currentModule = modules.find(m => m.id === currentModule?.parentId) || null
  }

  // Return path with leading slash
  return `/${path.join('/')}`
}

/**
 * Alternative implementation that can handle modules with parent relationships
 * This version works with the current data structure where we have parent info
 */
export function buildModulePathFromParent(
  modules: (Module & { parent: { name: string } })[],
  selectedModule: Module & { parent: { name: string } },
): string {
  const path: string[] = []
  let currentModule: (Module & { parent: { name: string } }) | null = selectedModule

  // Build path from current module up to root
  while (currentModule) {
    path.unshift(currentModule.name)

    if (currentModule.parent?.name) {
      // Find the parent module in the modules array
      const parentModule = modules.find(m => m.name === currentModule?.parent?.name)
      currentModule = parentModule || null
    } else {
      // No parent, we've reached the root
      currentModule = null
    }
  }

  // Return path with leading slash
  return `/${path.join('/')}`
}

/**
 * Builds paths for all modules in a single pass for better performance
 * @param modules - Array of all modules with parent info
 * @returns Map of module ID to path string
 */
export function buildAllModulePaths(modules: (Module & { parent: { name: string } })[]): Map<string, string> {
  const pathMap = new Map<string, string>()

  // First pass: create a map for quick lookup
  const moduleMap = new Map<string, Module & { parent: { name: string } }>()
  modules.forEach(module => moduleMap.set(module.id, module))

  // Second pass: build paths for each module
  modules.forEach(module => {
    const path = buildModulePathFromParent(modules, module)
    pathMap.set(module.id, path)
  })

  return pathMap
}
