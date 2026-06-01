#!/usr/bin/env tsx

/**
 * Script to synchronize test suites from feature files to database
 * Scans feature files to ensure all test suites exist in DB
 * Filesystem is the source of truth - test suites in DB but not in FS will be deleted
 * Run this after merging changes to ensure test suite sync
 *
 * Usage: npx tsx scripts/sync-test-suites.ts
 */

import prisma from '../src/config/db-config'
import { scanFeatureFiles, extractModulePathFromFilePath, ParsedFeature } from '../src/lib/gherkin-parser'
import { buildModuleHierarchy, findModuleByPath, getAllModulesWithPaths } from '../src/lib/module-hierarchy-builder'
import { ensureAutomationWorkspaceReady, getAutomationFeaturesDir } from '../src/lib/automation/paths'
import { getTestSuiteSyncIdentity, getTestSuiteFilesystemKey } from '../src/lib/sync/projected-feature-utils'
import { extractTestSuiteNameFromFilename } from './lib/filename-utils'
import { splitTagLine } from './lib/tag-parsing'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'
import type { Prisma } from '@prisma/client'

interface TestSuiteFromFS {
  name: string // From filename (without .feature extension)
  description: string | null // From Feature: line
  modulePath: string // From folder hierarchy
  tags: string[] // Feature-level tags (lines before Feature:)
  filePath: string // Full path to feature file
}

interface SyncResult {
  testSuitesScanned: number
  testSuitesExisting: number
  testSuitesCreated: number
  testSuitesUpdated: number
  testSuitesDeleted: number
  errors: string[]
  createdTestSuites: Array<{ name: string; modulePath: string }>
  updatedTestSuites: Array<{ name: string; modulePath: string }>
  deletedTestSuites: Array<{ name: string; modulePath: string }>
}

type ExistingTestSuite = Prisma.TestSuiteGetPayload<{ include: { tags: true } }>
type DbTestSuiteWithModule = Prisma.TestSuiteGetPayload<{ include: { module: true } }>

/**
 * Extracts feature-level tags from parsed feature
 * Handles tags on the same line separated by spaces
 */
function extractFeatureLevelTags(parsedFeature: ParsedFeature): string[] {
  const tags: string[] = []

  for (const tagLine of parsedFeature.tags) {
    if (tagLine.startsWith('@')) {
      const splitTags = splitTagLine(tagLine)
      tags.push(...splitTags)
    }
  }

  return tags
}

/**
 * Scans feature files and extracts test suite information
 */
async function scanTestSuitesFromFilesystem(featuresDir: string): Promise<TestSuiteFromFS[]> {
  const testSuites: TestSuiteFromFS[] = []

  console.log('📁 Scanning feature files...')
  const parsedFeatures = await scanFeatureFiles(featuresDir)
  console.log(`   Found ${parsedFeatures.length} feature file(s)`)

  for (const parsedFeature of parsedFeatures) {
    try {
      const testSuiteName = extractTestSuiteNameFromFilename(parsedFeature.filePath)
      const modulePath = extractModulePathFromFilePath(parsedFeature.filePath, featuresDir)
      const tags = extractFeatureLevelTags(parsedFeature)

      testSuites.push({
        name: testSuiteName,
        description: parsedFeature.featureDescription || null,
        modulePath,
        tags,
        filePath: parsedFeature.filePath,
      })
    } catch (error) {
      console.error(`   ❌ Error processing feature file '${parsedFeature.filePath}': ${error}`)
    }
  }

  return testSuites
}

/**
 * Finds tags by tagExpression and returns their IDs
 * Returns empty array for tags that don't exist (logs warning)
 */
async function findTagIdsByExpressions(tagExpressions: string[]): Promise<string[]> {
  const tagIds: string[] = []

  for (const tagExpression of tagExpressions) {
    try {
      const tag = await prisma.tag.findFirst({
        where: { tagExpression },
      })

      if (tag) {
        tagIds.push(tag.id)
      } else {
        console.log(`   ⚠️  Tag '${tagExpression}' not found in database (skipping tag link)`)
      }
    } catch (error) {
      console.error(`   ❌ Error finding tag '${tagExpression}': ${error}`)
    }
  }

  return tagIds
}

async function resolveModuleId(modulePath: string) {
  let moduleId = await findModuleByPath(modulePath)

  if (!moduleId) {
    console.log(`   📦 Creating module hierarchy for path: ${modulePath}`)
    moduleId = await buildModuleHierarchy(modulePath)
  }

  return moduleId
}

async function findExistingTestSuite(
  testSuite: TestSuiteFromFS,
  moduleId: string,
): Promise<ExistingTestSuite | undefined> {
  const existingTestSuites = await prisma.testSuite.findMany({
    where: {
      moduleId,
    },
    include: {
      tags: true,
    },
  })

  return existingTestSuites.find(
    candidate => getTestSuiteFilesystemKey(candidate.name) === getTestSuiteFilesystemKey(testSuite.name),
  )
}

function getSortedTagIds(existingTestSuite: ExistingTestSuite, tagIds: string[]) {
  return {
    currentTagIds: existingTestSuite.tags.map(t => t.id).sort(),
    newTagIds: [...tagIds].sort(),
  }
}

function testSuiteNeedsUpdate(
  existingTestSuite: ExistingTestSuite,
  testSuite: TestSuiteFromFS,
  moduleId: string,
  tagIds: string[],
) {
  const { currentTagIds, newTagIds } = getSortedTagIds(existingTestSuite, tagIds)

  return (
    existingTestSuite.description !== (testSuite.description || null) ||
    existingTestSuite.moduleId !== moduleId ||
    JSON.stringify(currentTagIds) !== JSON.stringify(newTagIds)
  )
}

async function getExistingTestCaseRefs(existingTestSuiteId: string) {
  return prisma.testCase.findMany({
    where: {
      TestSuite: {
        some: {
          id: existingTestSuiteId,
        },
      },
    },
    select: { id: true },
  })
}

function logPreservedTestCases(testCaseCount: number, testSuite: TestSuiteFromFS) {
  if (testCaseCount === 0) {
    return
  }

  console.log(
    `   ℹ️  Preserving ${testCaseCount} existing test case(s) for '${testSuite.name}' (${testSuite.modulePath})`,
  )
}

async function updateExistingTestSuite(
  existingTestSuite: ExistingTestSuite,
  testSuite: TestSuiteFromFS,
  moduleId: string,
  tagIds: string[],
  result: SyncResult,
) {
  const existingTestCases = await getExistingTestCaseRefs(existingTestSuite.id)
  logPreservedTestCases(existingTestCases.length, testSuite)

  await prisma.testSuite.update({
    where: { id: existingTestSuite.id },
    data: {
      description: testSuite.description || null,
      moduleId,
      tags: {
        set: tagIds.map(id => ({ id })),
      },
      testCases:
        existingTestCases.length > 0
          ? {
              set: existingTestCases.map(tc => ({ id: tc.id })),
            }
          : undefined,
    },
  })

  result.testSuitesUpdated++
  result.updatedTestSuites.push({
    name: testSuite.name,
    modulePath: testSuite.modulePath,
  })
  console.log(`   🔄 Updated test suite '${testSuite.name}' (${testSuite.modulePath})`)
}

async function createTestSuite(testSuite: TestSuiteFromFS, moduleId: string, tagIds: string[], result: SyncResult) {
  await prisma.testSuite.create({
    data: {
      name: testSuite.name,
      description: testSuite.description || null,
      moduleId,
      tags: tagIds.length > 0 ? { connect: tagIds.map(id => ({ id })) } : undefined,
    },
  })

  result.testSuitesCreated++
  result.createdTestSuites.push({
    name: testSuite.name,
    modulePath: testSuite.modulePath,
  })
  console.log(`   ➕ Created test suite '${testSuite.name}' (${testSuite.modulePath})`)
}

async function syncFilesystemTestSuite(testSuite: TestSuiteFromFS, fsTestSuiteKeys: Set<string>, result: SyncResult) {
  const key = getTestSuiteSyncIdentity(testSuite.name, testSuite.modulePath)
  fsTestSuiteKeys.add(key)

  const moduleId = await resolveModuleId(testSuite.modulePath)
  const existingTestSuite = await findExistingTestSuite(testSuite, moduleId)
  const tagIds = await findTagIdsByExpressions(testSuite.tags)

  if (!existingTestSuite) {
    await createTestSuite(testSuite, moduleId, tagIds, result)
    return
  }

  if (testSuiteNeedsUpdate(existingTestSuite, testSuite, moduleId, tagIds)) {
    await updateExistingTestSuite(existingTestSuite, testSuite, moduleId, tagIds, result)
    return
  }

  result.testSuitesExisting++
  console.log(`   ✓ Test suite '${testSuite.name}' (${testSuite.modulePath}) already up to date`)
}

function createModulePathMap(modulesWithPaths: Awaited<ReturnType<typeof getAllModulesWithPaths>>) {
  const modulePathMap = new Map<string, string>()

  for (const mod of modulesWithPaths) {
    modulePathMap.set(mod.id, mod.path)
  }

  return modulePathMap
}

async function logOrphanedTestCases(dbTestSuite: DbTestSuiteWithModule, modulePath: string) {
  const testSuiteWithCases = await prisma.testSuite.findUnique({
    where: { id: dbTestSuite.id },
    include: {
      testCases: { select: { id: true } },
    },
  })

  if (testSuiteWithCases && testSuiteWithCases.testCases.length > 0) {
    console.log(
      `   ⚠️  Test suite '${dbTestSuite.name}' (${modulePath}) has ${testSuiteWithCases.testCases.length} test case(s) - will be cascade deleted`,
    )
  }
}

async function deleteOrphanedTestSuite(dbTestSuite: DbTestSuiteWithModule, modulePath: string, result: SyncResult) {
  await logOrphanedTestCases(dbTestSuite, modulePath)

  await prisma.testSuite.delete({
    where: { id: dbTestSuite.id },
  })

  result.testSuitesDeleted++
  result.deletedTestSuites.push({
    name: dbTestSuite.name,
    modulePath,
  })
  console.log(`   🗑️  Deleted test suite '${dbTestSuite.name}' (${modulePath}) (not in filesystem)`)
}

function getDbTestSuiteModulePath(dbTestSuite: DbTestSuiteWithModule, modulePathMap: Map<string, string>) {
  return modulePathMap.get(dbTestSuite.moduleId) || '/'
}

function isOrphanedTestSuite(dbTestSuite: DbTestSuiteWithModule, modulePath: string, fsTestSuiteKeys: Set<string>) {
  return !fsTestSuiteKeys.has(getTestSuiteSyncIdentity(dbTestSuite.name, modulePath))
}

function recordOrphanDeleteError(dbTestSuite: DbTestSuiteWithModule, error: unknown, result: SyncResult) {
  const errorMsg = `Error deleting test suite '${dbTestSuite.name}': ${error}`
  result.errors.push(errorMsg)
  console.error(`   ❌ ${errorMsg}`)
}

async function deleteOrphanedTestSuiteIfNeeded(
  dbTestSuite: DbTestSuiteWithModule,
  modulePathMap: Map<string, string>,
  fsTestSuiteKeys: Set<string>,
  result: SyncResult,
) {
  try {
    const modulePath = getDbTestSuiteModulePath(dbTestSuite, modulePathMap)

    if (isOrphanedTestSuite(dbTestSuite, modulePath, fsTestSuiteKeys)) {
      await deleteOrphanedTestSuite(dbTestSuite, modulePath, result)
    }
  } catch (error) {
    recordOrphanDeleteError(dbTestSuite, error, result)
  }
}

async function deleteOrphanedTestSuites(fsTestSuiteKeys: Set<string>, result: SyncResult) {
  console.log('\n🔍 Checking for orphaned test suites (not in filesystem)...')
  const allDbTestSuites = await prisma.testSuite.findMany({
    include: {
      module: true,
    },
  })
  const modulePathMap = createModulePathMap(await getAllModulesWithPaths())

  for (const dbTestSuite of allDbTestSuites) {
    await deleteOrphanedTestSuiteIfNeeded(dbTestSuite, modulePathMap, fsTestSuiteKeys, result)
  }
}

/**
 * Syncs test suites from filesystem to database
 */
async function syncTestSuitesToDatabase(testSuitesFromFS: TestSuiteFromFS[], result: SyncResult): Promise<void> {
  console.log('\n✅ Syncing test suites to database...')

  // Track test suites from filesystem (by name + modulePath)
  const fsTestSuiteKeys = new Set<string>()

  for (const testSuite of testSuitesFromFS) {
    try {
      await syncFilesystemTestSuite(testSuite, fsTestSuiteKeys, result)
    } catch (error) {
      const errorMsg = `Error processing test suite '${testSuite.name}' from ${testSuite.filePath}: ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  await deleteOrphanedTestSuites(fsTestSuiteKeys, result)
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult | void> {
  console.log('🔄 Starting test suites sync...')
  console.log('This will scan feature files and sync test suites to database.')
  console.log('Filesystem is the source of truth - test suites in DB but not in FS will be deleted.')
  console.log('Note: Test cases are not synced by this script (they will be handled separately).\n')

  await ensureAutomationWorkspaceReady()
  const featuresDir = getAutomationFeaturesDir()

  // Scan test suites from filesystem
  const testSuitesFromFS = await scanTestSuitesFromFilesystem(featuresDir)

  if (testSuitesFromFS.length === 0) {
    console.log('\n⚠️  No feature files found. Nothing to sync.')
    return
  }

  console.log(`\n📋 Found ${testSuitesFromFS.length} test suite(s) from feature files:`)
  for (const ts of testSuitesFromFS) {
    console.log(`   - ${ts.name} (${ts.modulePath})`)
  }

  // Initialize result
  const result: SyncResult = {
    testSuitesScanned: testSuitesFromFS.length,
    testSuitesExisting: 0,
    testSuitesCreated: 0,
    testSuitesUpdated: 0,
    testSuitesDeleted: 0,
    errors: [],
    createdTestSuites: [],
    updatedTestSuites: [],
    deletedTestSuites: [],
  }

  // Sync to database
  await syncTestSuitesToDatabase(testSuitesFromFS, result)

  printSyncSummary(
    [
      { label: '📁 Test suites scanned', value: result.testSuitesScanned },
      { label: '✅ Test suites existing', value: result.testSuitesExisting },
      { label: '➕ Test suites created', value: result.testSuitesCreated },
      { label: '🔄 Test suites updated', value: result.testSuitesUpdated },
      { label: '🗑️  Test suites deleted', value: result.testSuitesDeleted },
      { label: '❌ Errors', value: result.errors.length },
    ],
    [
      {
        title: 'Created test suites',
        items: result.createdTestSuites.map(ts => `${ts.name} (${ts.modulePath})`),
      },
      {
        title: 'Updated test suites',
        items: result.updatedTestSuites.map(ts => `${ts.name} (${ts.modulePath})`),
      },
      {
        title: 'Deleted test suites',
        items: result.deletedTestSuites.map(ts => `${ts.name} (${ts.modulePath})`),
      },
      { title: 'Errors', items: result.errors },
    ],
  )
  return result
}

runSyncScript(main)
