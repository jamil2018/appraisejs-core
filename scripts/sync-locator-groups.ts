#!/usr/bin/env tsx

/**
 * Script to synchronize locator groups from filesystem to database
 * Scans locator-map.json and locators directory to ensure all locator groups exist in DB
 * Filesystem is the source of truth - locator groups in DB but not in FS will be deleted
 * Run this after merging changes to ensure locator group sync
 *
 * Usage: npx tsx scripts/sync-locator-groups.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import prisma from '../src/config/db-config'
import { findModuleByPath, buildModuleHierarchy } from '../src/lib/module-hierarchy-builder'
import { getAutomationLocatorMapPath } from '../src/lib/template-sync-utils'
import { extractLocatorGroupName, extractModulePathFromLocatorFile } from './lib/filename-utils'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

/**
 * Represents a locator group from the filesystem
 */
interface LocatorGroupFromFS {
  name: string
  route: string
  modulePath: string
  filePath: string
}

/**
 * Represents a locator group entry from locator-map.json
 */
interface LocatorMapEntry {
  name: string
  path: string
}

/**
 * Sync result summary
 */
interface SyncResult {
  locatorGroupsScanned: number
  locatorGroupsExisting: number
  locatorGroupsCreated: number
  locatorGroupsUpdated: number
  locatorGroupsDeleted: number
  errors: string[]
  createdLocatorGroups: string[]
  updatedLocatorGroups: string[]
  deletedLocatorGroups: Array<{ name: string; locatorCount: number }>
}

/**
 * Reads and parses the locator-map.json file
 */
async function readLocatorMap(baseDir: string): Promise<LocatorMapEntry[]> {
  const locatorMapPath = getAutomationLocatorMapPath(baseDir)

  try {
    await fs.access(locatorMapPath)
  } catch {
    console.warn(`   ⚠️  Locator map file not found at ${locatorMapPath}, continuing without it`)
    return []
  }

  try {
    const fileContent = await fs.readFile(locatorMapPath, 'utf-8')
    const locatorMap = JSON.parse(fileContent) as LocatorMapEntry[]

    if (!Array.isArray(locatorMap)) {
      throw new Error('Invalid locator map format: expected an array')
    }

    return locatorMap
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in locator map file: ${error.message}`)
    }
    throw error
  }
}

/**
 * Scans the locators directory to find all locator group files
 */
async function scanLocatorGroupFiles(baseDir: string): Promise<string[]> {
  const pattern = 'automation/locators/**/*.json'

  try {
    const files = await glob(pattern, {
      cwd: baseDir,
    })
    return files.map(file => join(baseDir, file))
  } catch (error) {
    throw new Error(`Error scanning locator group files: ${error}`)
  }
}

/**
 * Builds a map of locator group names to routes from locator-map.json
 */
function buildLocatorMapRouteMap(locatorMap: LocatorMapEntry[]): Map<string, string> {
  const routeMap = new Map<string, string>()

  for (const entry of locatorMap) {
    routeMap.set(entry.name, entry.path)
  }

  return routeMap
}

/**
 * Builds locator groups from filesystem
 * Combines information from locator-map.json and directory structure
 */
async function buildLocatorGroupsFromFS(baseDir: string, locatorMap: LocatorMapEntry[]): Promise<LocatorGroupFromFS[]> {
  const locatorGroups: LocatorGroupFromFS[] = []
  const routeMap = buildLocatorMapRouteMap(locatorMap)

  // Scan all locator group files
  const files = await scanLocatorGroupFiles(baseDir)

  for (const filePath of files) {
    const modulePath = extractModulePathFromLocatorFile(filePath, baseDir)
    const groupName = extractLocatorGroupName(filePath)

    // Get route from locator-map.json, or default to /{groupName}
    const route = routeMap.get(groupName) || `/${groupName}`

    locatorGroups.push({
      name: groupName,
      route,
      modulePath,
      filePath,
    })
  }

  return locatorGroups
}

/**
 * Creates or updates a locator group in the database
 */
async function createOrUpdateLocatorGroup(
  locatorGroup: LocatorGroupFromFS,
  moduleId: string,
  result: SyncResult,
): Promise<void> {
  try {
    // Check if locator group already exists
    const existingGroup = await prisma.locatorGroup.findUnique({
      where: { name: locatorGroup.name },
    })

    if (existingGroup) {
      // Check if update is needed
      const needsUpdate = existingGroup.route !== locatorGroup.route || existingGroup.moduleId !== moduleId

      if (needsUpdate) {
        await prisma.locatorGroup.update({
          where: { id: existingGroup.id },
          data: {
            route: locatorGroup.route,
            moduleId: moduleId,
          },
        })

        result.locatorGroupsUpdated++
        result.updatedLocatorGroups.push(locatorGroup.name)
        console.log(`   🔄 Updated locator group '${locatorGroup.name}' (route: ${locatorGroup.route})`)
      } else {
        result.locatorGroupsExisting++
        console.log(`   ✓ Locator group '${locatorGroup.name}' already exists and is up to date`)
      }
    } else {
      // Create new locator group
      await prisma.locatorGroup.create({
        data: {
          name: locatorGroup.name,
          route: locatorGroup.route,
          moduleId: moduleId,
        },
      })

      result.locatorGroupsCreated++
      result.createdLocatorGroups.push(locatorGroup.name)
      console.log(`   ➕ Created locator group '${locatorGroup.name}' (route: ${locatorGroup.route})`)
    }
  } catch (error) {
    const errorMsg = `Error syncing locator group '${locatorGroup.name}': ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Syncs locator groups from filesystem to database
 */
async function syncLocatorGroupsToDatabase(locatorGroups: LocatorGroupFromFS[], result: SyncResult): Promise<void> {
  console.log('\n✅ Syncing locator groups to database...')

  for (const locatorGroup of locatorGroups) {
    try {
      // Ensure module exists (create if needed)
      let moduleId = await findModuleByPath(locatorGroup.modulePath)

      if (!moduleId) {
        console.log(`   📦 Creating module hierarchy for path: ${locatorGroup.modulePath}`)
        moduleId = await buildModuleHierarchy(locatorGroup.modulePath)
      }

      // Create or update locator group
      await createOrUpdateLocatorGroup(locatorGroup, moduleId, result)
    } catch (error) {
      const errorMsg = `Error processing locator group '${locatorGroup.name}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }
}

/**
 * Deletes orphaned locator groups (groups in DB but not in FS)
 */
async function deleteOrphanedLocatorGroups(fsLocatorGroupNames: Set<string>, result: SyncResult): Promise<void> {
  console.log('\n🔍 Checking for orphaned locator groups (not in filesystem)...')

  try {
    // Get all locator groups from database
    const dbLocatorGroups = await prisma.locatorGroup.findMany({
      include: {
        locators: {
          select: { id: true },
        },
      },
    })

    for (const dbGroup of dbLocatorGroups) {
      // Check if locator group exists in filesystem
      if (!fsLocatorGroupNames.has(dbGroup.name)) {
        try {
          const locatorCount = dbGroup.locators.length

          if (locatorCount > 0) {
            console.log(
              `   ⚠️  Locator group '${dbGroup.name}' has ${locatorCount} locator(s) - will be cascade deleted`,
            )
          }

          // Delete the locator group (Prisma cascade will handle locators)
          await prisma.locatorGroup.delete({
            where: { id: dbGroup.id },
          })

          result.locatorGroupsDeleted++
          result.deletedLocatorGroups.push({
            name: dbGroup.name,
            locatorCount,
          })
          console.log(`   🗑️  Deleted locator group '${dbGroup.name}' (not in filesystem)`)
        } catch (error) {
          const errorMsg = `Error deleting locator group '${dbGroup.name}': ${error}`
          result.errors.push(errorMsg)
          console.error(`   ❌ ${errorMsg}`)
        }
      }
    }
  } catch (error) {
    const errorMsg = `Error checking for orphaned locator groups: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult> {
  console.log('🔄 Starting locator groups sync...')
  console.log('This will scan filesystem directories and sync locator groups to database.')
  console.log('Filesystem is the source of truth - locator groups in DB but not in FS will be deleted.\n')

  const baseDir = process.cwd()

  // Initialize result
  const result: SyncResult = {
    locatorGroupsScanned: 0,
    locatorGroupsExisting: 0,
    locatorGroupsCreated: 0,
    locatorGroupsUpdated: 0,
    locatorGroupsDeleted: 0,
    errors: [],
    createdLocatorGroups: [],
    updatedLocatorGroups: [],
    deletedLocatorGroups: [],
  }

  // Read locator map
  console.log('📄 Reading locator-map.json...')
  const locatorMap = await readLocatorMap(baseDir)
  console.log(`   Found ${locatorMap.length} entry(ies) in locator map`)

  // Build locator groups from filesystem
  console.log('\n📁 Scanning automation/locators directory...')
  const locatorGroups = await buildLocatorGroupsFromFS(baseDir, locatorMap)
  result.locatorGroupsScanned = locatorGroups.length
  console.log(`   Found ${locatorGroups.length} locator group(s) in filesystem`)

  if (locatorGroups.length > 0) {
    console.log('\n   Locator groups found:')
    locatorGroups.forEach((group, index) => {
      console.log(`      ${index + 1}. ${group.name} (route: ${group.route}, module: ${group.modulePath})`)
    })
  }

  // Sync to database
  await syncLocatorGroupsToDatabase(locatorGroups, result)

  // Delete orphaned locator groups
  const fsLocatorGroupNames = new Set(locatorGroups.map(g => g.name))
  await deleteOrphanedLocatorGroups(fsLocatorGroupNames, result)

  printSyncSummary(
    [
      { label: '📁 Locator groups scanned', value: result.locatorGroupsScanned },
      { label: '✅ Locator groups existing', value: result.locatorGroupsExisting },
      { label: '➕ Locator groups created', value: result.locatorGroupsCreated },
      { label: '🔄 Locator groups updated', value: result.locatorGroupsUpdated },
      { label: '🗑️  Locator groups deleted', value: result.locatorGroupsDeleted },
      { label: '❌ Errors', value: result.errors.length },
    ],
    [
      { title: 'Created locator groups', items: result.createdLocatorGroups },
      { title: 'Updated locator groups', items: result.updatedLocatorGroups },
      {
        title: 'Deleted locator groups',
        items: result.deletedLocatorGroups.map(
          group => `${group.name} (${group.locatorCount} locator(s) cascade deleted)`,
        ),
      },
      { title: 'Errors', items: result.errors },
    ],
  )
  return result
}

runSyncScript(main)
