#!/usr/bin/env tsx

/**
 * Script to synchronize locators from filesystem to database
 * Scans locator JSON files to ensure all locators exist in DB
 * Filesystem is the source of truth - locators in DB but not in FS will be deleted
 * Run this after merging changes to ensure locator sync
 *
 * Usage: npx tsx scripts/sync-locators.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import prisma from '../src/config/db-config'
import { buildModuleHierarchy } from '../src/lib/module-hierarchy-builder'
import { getLocatorGroupFilePath } from '../src/lib/locator-group-file-utils'

interface LocatorData {
  name: string
  value: string
  locatorGroupId: string
  locatorGroupName: string
  modulePath: string
}

interface SyncResult {
  locatorsScanned: number
  locatorsExisting: number
  locatorsCreated: number
  locatorsDeleted: number
  locatorsUpdated: number
  locatorGroupsDeleted: number
  errors: string[]
  createdLocators: Array<{ name: string; group: string }>
  deletedLocators: Array<{ name: string; group: string }>
  updatedLocators: Array<{ name: string; group: string }>
  deletedLocatorGroups: Array<{ name: string; locatorCount: number }>
}

/**
 * Scans locator directory for all JSON files
 */
async function scanLocatorFiles(baseDir: string): Promise<string[]> {
  const pattern = 'src/tests/locators/**/*.json'
  try {
    const files = await glob(pattern, {
      cwd: baseDir,
    })
    return files.map(file => join(baseDir, file))
  } catch (error) {
    throw new Error(`Error scanning locator files: ${error}`)
  }
}

/**
 * Extracts module path from locator file path
 * Example: src/tests/locators/users/admins/directors/directors.json -> /users/admins/directors
 */
function extractModulePathFromLocatorFile(filePath: string, baseDir: string): string {
  const testsDir = join(baseDir, 'src', 'tests')
  const relativePath = filePath.replace(testsDir, '').replace(/\\/g, '/')
  const pathParts = relativePath.split('/').filter(p => p && p !== 'locators')
  const moduleParts = pathParts.slice(0, -1) // Remove filename
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

/**
 * Extracts locator group name from file path
 * The group name is just the filename without extension
 */
function extractLocatorGroupName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  return fileName.replace('.json', '')
}

/**
 * Reads and parses a locator JSON file
 */
async function readLocatorFile(filePath: string): Promise<Record<string, string>> {
  try {
    await fs.access(filePath)
  } catch (error) {
    throw new Error(`Locator file not found at ${filePath}`)
  }

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent) as Record<string, string>

    if (!jsonContent || typeof jsonContent !== 'object') {
      throw new Error('Invalid JSON structure: expected an object')
    }

    return jsonContent
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in locator file: ${error.message}`)
    }
    throw error
  }
}

/**
 * Finds or creates a LocatorGroup
 */
async function findOrCreateLocatorGroup(
  groupName: string,
  moduleId: string,
  modulePath: string,
): Promise<string> {
  // Try to find existing locator group
  const existingGroup = await prisma.locatorGroup.findFirst({
    where: {
      name: groupName,
      moduleId: moduleId,
    },
  })

  if (existingGroup) {
    return existingGroup.id
  }

  // Create new locator group
  const newGroup = await prisma.locatorGroup.create({
    data: {
      name: groupName,
      route: `/${groupName}`,
      moduleId: moduleId,
    },
  })

  return newGroup.id
}

/**
 * Syncs locators from a single file to database
 */
async function syncLocatorsFromFile(
  filePath: string,
  baseDir: string,
  result: SyncResult,
  processedGroupIds: Set<string>,
): Promise<void> {
  try {
    // Extract module path and group name
    const modulePath = extractModulePathFromLocatorFile(filePath, baseDir)
    const groupName = extractLocatorGroupName(filePath)

    console.log(`\n   📄 Processing file: ${filePath.replace(baseDir, '')}`)
    console.log(`      Module path: ${modulePath}`)
    console.log(`      Group name: ${groupName}`)

    // Build module hierarchy
    const moduleId = await buildModuleHierarchy(modulePath)

    // Find or create locator group
    const locatorGroupId = await findOrCreateLocatorGroup(groupName, moduleId, modulePath)
    
    // Track this group as processed (has a file)
    processedGroupIds.add(locatorGroupId)

    // Read locators from file
    const fileLocators = await readLocatorFile(filePath)
    const fileLocatorNames = Object.keys(fileLocators)
    result.locatorsScanned += fileLocatorNames.length

    console.log(`      Found ${fileLocatorNames.length} locator(s) in file`)

    // Get existing locators from database for this group
    const dbLocators = await prisma.locator.findMany({
      where: { locatorGroupId: locatorGroupId },
      select: { id: true, name: true, value: true },
    })

    const dbLocatorMap = new Map(dbLocators.map(loc => [loc.name, loc]))
    const dbLocatorNames = new Set(dbLocators.map(loc => loc.name))

    // Add or update locators from file
    for (const [locatorName, locatorValue] of Object.entries(fileLocators)) {
      const existingLocator = dbLocatorMap.get(locatorName)

      if (existingLocator) {
        // Check if value changed
        if (existingLocator.value !== locatorValue) {
          // Update locator value (file takes precedence)
          await prisma.locator.update({
            where: { id: existingLocator.id },
            data: { value: locatorValue },
          })
          result.locatorsUpdated++
          result.updatedLocators.push({ name: locatorName, group: groupName })
          console.log(`      🔄 Updated locator '${locatorName}'`)
        } else {
          result.locatorsExisting++
        }
      } else {
        // Create new locator
        await prisma.locator.create({
          data: {
            name: locatorName,
            value: locatorValue,
            locatorGroupId: locatorGroupId,
          },
        })
        result.locatorsCreated++
        result.createdLocators.push({ name: locatorName, group: groupName })
        console.log(`      ➕ Created locator '${locatorName}'`)
      }
    }

    // Delete locators that exist in DB but not in file (FS is source of truth)
    for (const dbLocator of dbLocators) {
      if (!fileLocatorNames.includes(dbLocator.name)) {
        await prisma.locator.delete({
          where: { id: dbLocator.id },
        })
        result.locatorsDeleted++
        result.deletedLocators.push({ name: dbLocator.name, group: groupName })
        console.log(`      🗑️  Deleted locator '${dbLocator.name}' (not in file)`)
      }
    }
  } catch (error) {
    const errorMsg = `Error syncing locator file ${filePath}: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Deletes locator groups that don't have corresponding files
 */
async function deleteOrphanedLocatorGroups(
  processedGroupIds: Set<string>,
  baseDir: string,
  result: SyncResult,
): Promise<void> {
  console.log('\n🔍 Checking for orphaned locator groups (no file in filesystem)...')
  
  try {
    // Get all locator groups from database
    const allLocatorGroups = await prisma.locatorGroup.findMany({
      include: {
        locators: {
          select: { id: true },
        },
      },
    })

    for (const group of allLocatorGroups) {
      // Skip if this group was processed (has a file)
      if (processedGroupIds.has(group.id)) {
        continue
      }

      // Check if file exists for this group
      const relativeFilePath = await getLocatorGroupFilePath(group.id)
      if (!relativeFilePath) {
        // Can't determine file path, skip
        continue
      }

      const fullPath = join(baseDir, relativeFilePath)

      try {
        // Check if file exists
        await fs.access(fullPath)
        // File exists, so this group is valid
      } catch {
        // File doesn't exist - delete the locator group (cascade will delete locators)
        const locatorCount = group.locators.length
        await prisma.locatorGroup.delete({
          where: { id: group.id },
        })
        result.locatorGroupsDeleted++
        result.deletedLocatorGroups.push({ name: group.name, locatorCount })
        console.log(`   🗑️  Deleted locator group '${group.name}' (${locatorCount} locator(s) deleted)`)
      }
    }
  } catch (error) {
    const errorMsg = `Error deleting orphaned locator groups: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Syncs all locators to database
 */
async function syncLocatorsToDatabase(files: string[], baseDir: string): Promise<SyncResult> {
  const result: SyncResult = {
    locatorsScanned: 0,
    locatorsExisting: 0,
    locatorsCreated: 0,
    locatorsDeleted: 0,
    locatorsUpdated: 0,
    locatorGroupsDeleted: 0,
    errors: [],
    createdLocators: [],
    deletedLocators: [],
    updatedLocators: [],
    deletedLocatorGroups: [],
  }

  // Track which locator groups have files
  const processedGroupIds = new Set<string>()

  // Process all files
  for (const filePath of files) {
    await syncLocatorsFromFile(filePath, baseDir, result, processedGroupIds)
  }

  // Delete locator groups that don't have files
  await deleteOrphanedLocatorGroups(processedGroupIds, baseDir, result)

  return result
}

/**
 * Generates and displays sync summary
 */
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Locators scanned: ${result.locatorsScanned}`)
  console.log(`   ✅ Locators existing: ${result.locatorsExisting}`)
  console.log(`   ➕ Locators created: ${result.locatorsCreated}`)
  console.log(`   🔄 Locators updated: ${result.locatorsUpdated}`)
  console.log(`   🗑️  Locators deleted: ${result.locatorsDeleted}`)
  console.log(`   🗑️  Locator groups deleted: ${result.locatorGroupsDeleted}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdLocators.length > 0) {
    console.log('\n   Created locators:')
    result.createdLocators.forEach((loc, index) => {
      console.log(`      ${index + 1}. ${loc.name} (group: ${loc.group})`)
    })
  }

  if (result.updatedLocators.length > 0) {
    console.log('\n   Updated locators:')
    result.updatedLocators.forEach((loc, index) => {
      console.log(`      ${index + 1}. ${loc.name} (group: ${loc.group})`)
    })
  }

  if (result.deletedLocators.length > 0) {
    console.log('\n   Deleted locators:')
    result.deletedLocators.forEach((loc, index) => {
      console.log(`      ${index + 1}. ${loc.name} (group: ${loc.group})`)
    })
  }

  if (result.deletedLocatorGroups.length > 0) {
    console.log('\n   Deleted locator groups:')
    result.deletedLocatorGroups.forEach((group, index) => {
      console.log(`      ${index + 1}. ${group.name} (${group.locatorCount} locator(s) deleted)`)
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
    console.log('🔄 Starting locators sync...')
    console.log('This will scan locator JSON files and sync locators to database.')
    console.log('Filesystem is the source of truth - locators in DB but not in FS will be deleted.\n')

    const baseDir = process.cwd()

    // Scan locator files
    console.log('📁 Scanning src/tests/locators...')
    const files = await scanLocatorFiles(baseDir)
    console.log(`   Found ${files.length} locator file(s)`)

    if (files.length === 0) {
      console.log('\n⚠️  No locator files found. Nothing to sync.')
      return
    }

    // Sync to database
    console.log('\n✅ Syncing locators to database...')
    const result = await syncLocatorsToDatabase(files, baseDir)

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

