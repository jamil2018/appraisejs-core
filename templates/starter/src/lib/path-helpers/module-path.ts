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
