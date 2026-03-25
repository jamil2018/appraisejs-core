#!/usr/bin/env tsx

/**
 * Script to synchronize module hierarchy from filesystem to database
 * Scans locators and features directories to ensure all modules exist in DB
 * Filesystem is the source of truth - modules in DB but not in FS will be deleted
 * Run this after merging changes to ensure module sync
 *
 * Usage: npx tsx scripts/sync-modules.ts
 */

import { buildModuleHierarchy, findModuleByPath, getAllModulesWithPaths } from '../src/lib/module-hierarchy-builder'
import { join } from 'path'
import { glob } from 'glob'
import prisma from '../src/config/db-config'
import { extractModulePathFromAutomationFile } from '../src/lib/template-sync-utils'

interface SyncResult {
  modulesScanned: number
  modulesExisting: number
  modulesCreated: number
  modulesDeleted: number
  errors: string[]
  createdModules: string[]
  existingModules: string[]
  deletedModules: string[]
}

/**
 * Scans locator directories and extracts module paths
 */
async function scanLocatorDirectories(baseDir: string): Promise<string[]> {
  const modulePaths = new Set<string>()

  try {
    // Get all JSON files in locators directory
    const pattern = 'automation/locators/**/*.json'
    const files = await glob(pattern, {
      cwd: baseDir,
    })

    for (const file of files) {
      const filePath = join(baseDir, file)
      const modulePath = extractModulePathFromLocatorFile(filePath, baseDir)
      if (modulePath) {
        modulePaths.add(modulePath)
      }
    }
  } catch (error) {
    console.error('Error scanning locator directories:', error)
    throw error
  }

  return Array.from(modulePaths)
}

/**
 * Scans feature directories and extracts module paths
 */
async function scanFeatureDirectories(baseDir: string): Promise<string[]> {
  const modulePaths = new Set<string>()

  try {
    // Get all feature files
    const pattern = 'automation/features/**/*.feature'
    const files = await glob(pattern, {
      cwd: baseDir,
    })

    for (const file of files) {
      const filePath = join(baseDir, file)
      const modulePath = extractModulePathFromFeatureFile(filePath, baseDir)
      if (modulePath) {
        modulePaths.add(modulePath)
      }
    }
  } catch (error) {
    console.error('Error scanning feature directories:', error)
    throw error
  }

  return Array.from(modulePaths)
}

/**
 * Extracts module path from locator file path
 * Example: automation/locators/home/home.json -> /home
 */
function extractModulePathFromLocatorFile(filePath: string, baseDir: string): string {
  return extractModulePathFromAutomationFile(filePath, baseDir, 'locators')
}

/**
 * Extracts module path from feature file path
 * Example: automation/features/login/demo.feature -> /login
 */
function extractModulePathFromFeatureFile(filePath: string, baseDir: string): string {
  return extractModulePathFromAutomationFile(filePath, baseDir, 'features')
}

/**
 * Builds a module tree from discovered paths
 * Returns a map of module paths to their parent paths
 */
function buildModuleTree(modulePaths: string[]): Map<string, string | null> {
  const tree = new Map<string, string | null>()

  // Add all paths and their parent paths
  for (const modulePath of modulePaths) {
    if (modulePath === '/') {
      tree.set('/', null)
      continue
    }

    const pathParts = modulePath.split('/').filter(p => p)
    let currentPath = ''

    for (let i = 0; i < pathParts.length; i++) {
      currentPath += '/' + pathParts[i]

      if (i === 0) {
        tree.set(currentPath, null)
      } else {
        const parentPath = '/' + pathParts.slice(0, i).join('/')
        tree.set(currentPath, parentPath)
      }
    }
  }

  return tree
}

/**
 * Syncs modules to database (creates missing modules)
 */
async function syncModulesToDatabase(moduleTree: Map<string, string | null>): Promise<SyncResult> {
  const result: SyncResult = {
    modulesScanned: moduleTree.size,
    modulesExisting: 0,
    modulesCreated: 0,
    modulesDeleted: 0,
    errors: [],
    createdModules: [],
    existingModules: [],
    deletedModules: [],
  }

  // Sort paths by depth (shallowest first) to ensure parents are created before children
  const sortedPaths = Array.from(moduleTree.keys()).sort((a, b) => {
    const depthA = a.split('/').filter(p => p).length
    const depthB = b.split('/').filter(p => p).length
    return depthA - depthB
  })

  for (const modulePath of sortedPaths) {
    try {
      // Check if module already exists
      const existingModuleId = await findModuleByPath(modulePath)

      if (existingModuleId) {
        result.modulesExisting++
        result.existingModules.push(modulePath)
        console.log(`   ✓ Module '${modulePath}' already exists`)
      } else {
        // Build the hierarchy for this path (which will create it if needed)
        await buildModuleHierarchy(modulePath)
        result.modulesCreated++
        result.createdModules.push(modulePath)
        console.log(`   ➕ Created module '${modulePath}'`)
      }
    } catch (error) {
      const errorMsg = `Error syncing module '${modulePath}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  return result
}

/**
 * Deletes orphaned modules (modules in DB but not in FS)
 */
async function deleteOrphanedModules(fsModulePaths: Set<string>, result: SyncResult): Promise<void> {
  console.log('\n🔍 Checking for orphaned modules (not in filesystem)...')

  try {
    // Get all modules from database with their paths
    const dbModules = await getAllModulesWithPaths()

    // Sort modules by reverse depth (deepest first) to avoid foreign key constraint issues
    const sortedDbModules = dbModules.sort((a, b) => {
      const depthA = a.path.split('/').filter(p => p).length
      const depthB = b.path.split('/').filter(p => p).length
      return depthB - depthA // Reverse order
    })

    for (const dbModule of sortedDbModules) {
      // Skip the default root module (preserve it)
      if (dbModule.name === 'root' && dbModule.parentId === null) {
        continue
      }

      // Check if module path exists in FS
      if (!fsModulePaths.has(dbModule.path)) {
        try {
          // Check if module has dependencies (for logging)
          const moduleWithDeps = await prisma.module.findUnique({
            where: { id: dbModule.id },
            include: {
              locatorGroups: { select: { id: true } },
              testSuites: { select: { id: true } },
            },
          })

          if (moduleWithDeps) {
            const hasLocatorGroups = moduleWithDeps.locatorGroups.length > 0
            const hasTestSuites = moduleWithDeps.testSuites.length > 0

            if (hasLocatorGroups || hasTestSuites) {
              const deps = []
              if (hasLocatorGroups) deps.push(`${moduleWithDeps.locatorGroups.length} locator group(s)`)
              if (hasTestSuites) deps.push(`${moduleWithDeps.testSuites.length} test suite(s)`)
              console.log(
                `   ⚠️  Module '${dbModule.path}' has dependencies (${deps.join(', ')}) - will be cascade deleted`,
              )
            }

            // Delete the module (Prisma cascade will handle children, locatorGroups, and testSuites)
            await prisma.module.delete({
              where: { id: dbModule.id },
            })

            result.modulesDeleted++
            result.deletedModules.push(dbModule.path)
            console.log(`   🗑️  Deleted module '${dbModule.path}' (not in filesystem)`)
          }
        } catch (error) {
          const errorMsg = `Error deleting module '${dbModule.path}': ${error}`
          result.errors.push(errorMsg)
          console.error(`   ❌ ${errorMsg}`)
        }
      }
    }
  } catch (error) {
    const errorMsg = `Error checking for orphaned modules: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Generates and displays sync summary
 */
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Modules scanned: ${result.modulesScanned}`)
  console.log(`   ✅ Modules existing: ${result.modulesExisting}`)
  console.log(`   ➕ Modules created: ${result.modulesCreated}`)
  console.log(`   🗑️  Modules deleted: ${result.modulesDeleted}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdModules.length > 0) {
    console.log('\n   Created modules:')
    result.createdModules.forEach((path, index) => {
      console.log(`      ${index + 1}. ${path}`)
    })
  }

  if (result.deletedModules.length > 0) {
    console.log('\n   Deleted modules:')
    result.deletedModules.forEach((path, index) => {
      console.log(`      ${index + 1}. ${path}`)
    })
  }

  if (result.errors.length > 0) {
    console.log('\n   Errors:')
    result.errors.forEach((error, index) => {
      console.log(`      ${index + 1}. ${error}`)
    })
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔄 Starting modules sync...')
    console.log('This will scan filesystem directories and sync module hierarchy to database.')
    console.log('Filesystem is the source of truth - modules in DB but not in FS will be deleted.\n')

    const baseDir = process.cwd()

    // Scan directories
    console.log('📁 Scanning automation/locators...')
    const locatorModulePaths = await scanLocatorDirectories(baseDir)
    console.log(`   Found ${locatorModulePaths.length} module path(s): ${locatorModulePaths.join(', ') || 'none'}`)

    console.log('\n📁 Scanning automation/features...')
    const featureModulePaths = await scanFeatureDirectories(baseDir)
    console.log(`   Found ${featureModulePaths.length} module path(s): ${featureModulePaths.join(', ') || 'none'}`)

    // Combine and deduplicate
    const allModulePaths = Array.from(new Set([...locatorModulePaths, ...featureModulePaths]))
    console.log(`\n🔍 Building module hierarchy from ${allModulePaths.length} unique module path(s)...`)

    // Build module tree
    const moduleTree = buildModuleTree(allModulePaths)

    // Sync to database (create missing modules)
    console.log('\n✅ Syncing modules to database...')
    const result = await syncModulesToDatabase(moduleTree)

    // Delete orphaned modules (modules in DB but not in FS)
    const fsModulePathsSet = new Set(allModulePaths)
    // Also add all parent paths from the tree
    for (const path of moduleTree.keys()) {
      fsModulePathsSet.add(path)
    }
    await deleteOrphanedModules(fsModulePathsSet, result)

    // Generate summary
    generateSummary(result)

    if (result.errors.length === 0) {
      console.log('\n✅ Sync completed successfully!')
    } else {
      console.log('\n⚠️  Sync completed with errors. Please review the errors above.')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Error during sync:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
