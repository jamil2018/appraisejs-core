#!/usr/bin/env tsx

/**
 * Script to synchronize module hierarchy from filesystem to database
 * Scans locators and features directories to ensure all modules exist in DB
 * Run this after merging changes to ensure module sync
 *
 * Usage: npx tsx scripts/sync-locator-maps.ts
 */

import { buildModuleHierarchy, findModuleByPath } from '../src/lib/module-hierarchy-builder'
import { join } from 'path'
import { promises as fs } from 'fs'
import { glob } from 'glob'
import prisma from '../src/config/db-config'

interface SyncResult {
  modulesScanned: number
  modulesExisting: number
  modulesCreated: number
  errors: string[]
  createdModules: string[]
  existingModules: string[]
}

/**
 * Scans locator directories and extracts module paths
 */
async function scanLocatorDirectories(baseDir: string): Promise<string[]> {
  const locatorsDir = join(baseDir, 'src', 'tests', 'locators')
  const modulePaths = new Set<string>()

  try {
    // Get all JSON files in locators directory
    const pattern = 'src/tests/locators/**/*.json'
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
  const featuresDir = join(baseDir, 'src', 'tests', 'features')
  const modulePaths = new Set<string>()

  try {
    // Get all feature files
    const pattern = 'src/tests/features/**/*.feature'
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
 */
function extractModulePathFromLocatorFile(filePath: string, baseDir: string): string {
  const testsDir = join(baseDir, 'src', 'tests')
  const relativePath = filePath.replace(testsDir, '').replace(/\\/g, '/')
  const pathParts = relativePath.split('/').filter(p => p && p !== 'locators')
  const moduleParts = pathParts.slice(0, -1) // Remove filename
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

/**
 * Extracts module path from feature file path
 */
function extractModulePathFromFeatureFile(filePath: string, baseDir: string): string {
  const featuresBaseDir = join(baseDir, 'src', 'tests', 'features')
  const relativePath = filePath.replace(featuresBaseDir, '').replace(/\\/g, '/')
  const pathParts = relativePath.split('/').filter(part => part && part !== '')
  const moduleParts = pathParts.slice(0, -1) // Remove filename
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

/**
 * Builds a module tree from discovered paths
 * Returns a map of module paths to their parent paths
 */
function buildModuleTree(modulePaths: string[]): Map<string, string | null> {
  const tree = new Map<string, string | null>()
  const allPaths = new Set<string>()

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
      allPaths.add(currentPath)

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
 * Syncs modules to database
 */
async function syncModulesToDatabase(moduleTree: Map<string, string | null>): Promise<SyncResult> {
  const result: SyncResult = {
    modulesScanned: moduleTree.size,
    modulesExisting: 0,
    modulesCreated: 0,
    errors: [],
    createdModules: [],
    existingModules: [],
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
        // Get parent path and find/create parent module first
        const parentPath = moduleTree.get(modulePath)
        let parentId: string | undefined

        if (parentPath) {
          const parentModuleId = await findModuleByPath(parentPath)
          if (!parentModuleId) {
            // Parent should have been created already due to sorting
            // But if not, create it now
            parentId = await buildModuleHierarchy(parentPath)
          } else {
            parentId = parentModuleId
          }
        }

        // Build the hierarchy for this path (which will create it if needed)
        const moduleId = await buildModuleHierarchy(modulePath)
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
 * Generates and displays sync summary
 */
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Modules scanned: ${result.modulesScanned}`)
  console.log(`   ✅ Modules existing: ${result.modulesExisting}`)
  console.log(`   ➕ Modules created: ${result.modulesCreated}`)
  console.log(`   ⚠️  Errors: ${result.errors.length}`)

  if (result.createdModules.length > 0) {
    console.log('\n   Created modules:')
    result.createdModules.forEach((path, index) => {
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
    console.log('🔄 Starting locator maps sync...')
    console.log('This will scan filesystem directories and sync module hierarchy to database.\n')

    const baseDir = process.cwd()

    // Scan directories
    console.log('📁 Scanning src/tests/locators...')
    const locatorModulePaths = await scanLocatorDirectories(baseDir)
    console.log(`   Found ${locatorModulePaths.length} module path(s): ${locatorModulePaths.join(', ') || 'none'}`)

    console.log('\n📁 Scanning src/tests/features...')
    const featureModulePaths = await scanFeatureDirectories(baseDir)
    console.log(`   Found ${featureModulePaths.length} module path(s): ${featureModulePaths.join(', ') || 'none'}`)

    // Combine and deduplicate
    const allModulePaths = Array.from(new Set([...locatorModulePaths, ...featureModulePaths]))
    console.log(`\n🔍 Building module hierarchy from ${allModulePaths.length} unique module path(s)...`)

    // Build module tree
    const moduleTree = buildModuleTree(allModulePaths)

    // Sync to database
    console.log('\n✅ Syncing modules to database...')
    const result = await syncModulesToDatabase(moduleTree)

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

