#!/usr/bin/env tsx

/**
 * Script to synchronize test suites from feature files to database
 * Scans feature files to ensure all test suites exist in DB
 * Filesystem is the source of truth - test suites in DB but not in FS will be deleted
 * Run this after merging changes to ensure test suite sync
 *
 * Usage: npx tsx scripts/sync-test-suites.ts
 */

import { join } from 'path'
import prisma from '../src/config/db-config'
import { scanFeatureFiles, extractModulePathFromFilePath, ParsedFeature } from '../src/lib/gherkin-parser'
import { buildModuleHierarchy, findModuleByPath, getAllModulesWithPaths } from '../src/lib/module-hierarchy-builder'

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

/**
 * Extracts test suite name from filename
 * Example: "login-validation.feature" -> "login-validation"
 */
function extractTestSuiteNameFromFilename(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  return fileName.replace(/\.feature$/, '')
}

/**
 * Splits a tag line that may contain multiple tags separated by spaces
 * Example: "@smoke @demo" -> ["@smoke", "@demo"]
 */
function splitTagLine(tagLine: string): string[] {
  return tagLine
    .split(/\s+/)
    .filter(tag => tag.trim().startsWith('@'))
    .map(tag => tag.trim())
}

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

/**
 * Syncs test suites from filesystem to database
 */
async function syncTestSuitesToDatabase(
  testSuitesFromFS: TestSuiteFromFS[],
  result: SyncResult,
): Promise<void> {
  console.log('\n✅ Syncing test suites to database...')
  
  // Track test suites from filesystem (by name + modulePath)
  const fsTestSuiteKeys = new Set<string>()
  
  for (const testSuite of testSuitesFromFS) {
    try {
      const key = `${testSuite.name}::${testSuite.modulePath}`
      fsTestSuiteKeys.add(key)
      
      // Ensure module exists
      let moduleId = await findModuleByPath(testSuite.modulePath)
      
      if (!moduleId) {
        console.log(`   📦 Creating module hierarchy for path: ${testSuite.modulePath}`)
        moduleId = await buildModuleHierarchy(testSuite.modulePath)
      }
      
      // Find existing test suite by name and moduleId
      const existingTestSuite = await prisma.testSuite.findFirst({
        where: {
          name: testSuite.name,
          moduleId: moduleId,
        },
        include: {
          tags: true,
        },
      })
      
      // Find tag IDs
      const tagIds = await findTagIdsByExpressions(testSuite.tags)
      
      if (existingTestSuite) {
        // Check if update is needed
        const currentTagIds = existingTestSuite.tags.map(t => t.id).sort()
        const newTagIds = tagIds.sort()
        const tagsChanged = JSON.stringify(currentTagIds) !== JSON.stringify(newTagIds)
        
        const needsUpdate =
          existingTestSuite.description !== (testSuite.description || null) ||
          existingTestSuite.moduleId !== moduleId ||
          tagsChanged
        
        if (needsUpdate) {
          // Get existing test cases to explicitly preserve them
          const existingTestCases = await prisma.testCase.findMany({
            where: {
              TestSuite: {
                some: {
                  id: existingTestSuite.id,
                },
              },
            },
            select: { id: true },
          })
          
          const testCaseCount = existingTestCases.length
          if (testCaseCount > 0) {
            console.log(
              `   ℹ️  Preserving ${testCaseCount} existing test case(s) for '${testSuite.name}' (${testSuite.modulePath})`,
            )
          }
          
          // Update test suite - explicitly preserve test cases by reconnecting them
          // Only update description, moduleId, and tags
          await prisma.testSuite.update({
            where: { id: existingTestSuite.id },
            data: {
              description: testSuite.description || null,
              moduleId: moduleId,
              tags: {
                set: tagIds.map(id => ({ id })),
              },
              // Explicitly preserve test cases by reconnecting them
              // This ensures they are not removed during the update
              testCases: existingTestCases.length > 0
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
        } else {
          result.testSuitesExisting++
          console.log(`   ✓ Test suite '${testSuite.name}' (${testSuite.modulePath}) already up to date`)
        }
      } else {
        // Create new test suite
        await prisma.testSuite.create({
          data: {
            name: testSuite.name,
            description: testSuite.description || null,
            moduleId: moduleId,
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
    } catch (error) {
      const errorMsg = `Error processing test suite '${testSuite.name}' from ${testSuite.filePath}: ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }
  
  // Delete orphaned test suites (test suites in DB but not in FS)
  console.log('\n🔍 Checking for orphaned test suites (not in filesystem)...')
  const allDbTestSuites = await prisma.testSuite.findMany({
    include: {
      module: true,
    },
  })
  
  // Get all modules with their paths
  const modulesWithPaths = await getAllModulesWithPaths()
  const modulePathMap = new Map<string, string>()
  for (const mod of modulesWithPaths) {
    modulePathMap.set(mod.id, mod.path)
  }
  
  for (const dbTestSuite of allDbTestSuites) {
    try {
      const modulePath = modulePathMap.get(dbTestSuite.moduleId) || '/'
      const key = `${dbTestSuite.name}::${modulePath}`
      
      if (!fsTestSuiteKeys.has(key)) {
        // Check if test suite has test cases (for logging)
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
        
        // Delete the test suite (Prisma cascade will handle test cases)
        await prisma.testSuite.delete({
          where: { id: dbTestSuite.id },
        })
        
        result.testSuitesDeleted++
        result.deletedTestSuites.push({
          name: dbTestSuite.name,
          modulePath: modulePath,
        })
        console.log(`   🗑️  Deleted test suite '${dbTestSuite.name}' (${modulePath}) (not in filesystem)`)
      }
    } catch (error) {
      const errorMsg = `Error deleting test suite '${dbTestSuite.name}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }
}

/**
 * Generates and displays sync summary
 */
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Test suites scanned: ${result.testSuitesScanned}`)
  console.log(`   ✅ Test suites existing: ${result.testSuitesExisting}`)
  console.log(`   ➕ Test suites created: ${result.testSuitesCreated}`)
  console.log(`   🔄 Test suites updated: ${result.testSuitesUpdated}`)
  console.log(`   🗑️  Test suites deleted: ${result.testSuitesDeleted}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)
  
  if (result.createdTestSuites.length > 0) {
    console.log('\n   Created test suites:')
    result.createdTestSuites.forEach((ts, index) => {
      console.log(`      ${index + 1}. ${ts.name} (${ts.modulePath})`)
    })
  }
  
  if (result.updatedTestSuites.length > 0) {
    console.log('\n   Updated test suites:')
    result.updatedTestSuites.forEach((ts, index) => {
      console.log(`      ${index + 1}. ${ts.name} (${ts.modulePath})`)
    })
  }
  
  if (result.deletedTestSuites.length > 0) {
    console.log('\n   Deleted test suites:')
    result.deletedTestSuites.forEach((ts, index) => {
      console.log(`      ${index + 1}. ${ts.name} (${ts.modulePath})`)
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
    console.log('🔄 Starting test suites sync...')
    console.log('This will scan feature files and sync test suites to database.')
    console.log('Filesystem is the source of truth - test suites in DB but not in FS will be deleted.')
    console.log('Note: Test cases are not synced by this script (they will be handled separately).\n')
    
    const baseDir = process.cwd()
    const featuresDir = join(baseDir, 'src', 'tests', 'features')
    
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
