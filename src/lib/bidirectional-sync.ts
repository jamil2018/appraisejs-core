import { promises as fs } from 'fs'
import { join } from 'path'
import { scanFeatureFiles } from './gherkin-parser'
import { mergeScenariosWithExistingTestSuites } from './database-sync'
import { generateFeatureFile } from './feature-file-generator'
import prisma from '@/config/db-config'
import { Module, TestSuite } from '@prisma/client'

// Type for TestSuite with included module relation
type TestSuiteWithModule = TestSuite & {
  module: Module
}

/**
 * Result of the bidirectional sync operation
 */
export interface SyncResult {
  // Database to Filesystem sync
  generatedFeatureFiles: number
  updatedFeatureFiles: number

  // Filesystem to Database sync
  createdTestSuites: number
  createdTestCases: number
  createdTemplateSteps: number
  mergedTestSuites: number
  addedScenarios: number

  // Overall stats
  totalProcessed: number
  errors: string[]
}

/**
 * Performs bidirectional synchronization between database and feature files
 * @param featuresBaseDir - Base directory for feature files
 * @returns Promise<SyncResult> - Result of the sync operation
 */
export async function performBidirectionalSync(featuresBaseDir: string): Promise<SyncResult> {
  const result: SyncResult = {
    generatedFeatureFiles: 0,
    updatedFeatureFiles: 0,
    createdTestSuites: 0,
    createdTestCases: 0,
    createdTemplateSteps: 0,
    mergedTestSuites: 0,
    addedScenarios: 0,
    totalProcessed: 0,
    errors: [],
  }

  try {
    console.log('🔄 Starting bidirectional sync between database and feature files...')

    // Step 1: Sync from filesystem to database (FS -> DB)
    console.log('📁 Scanning feature files from filesystem...')
    const parsedFeatures = await scanFeatureFiles(featuresBaseDir)
    console.log(`Found ${parsedFeatures.length} feature files`)

    if (parsedFeatures.length > 0) {
      console.log('💾 Syncing feature files to database...')
      const fsToDbResult = await mergeScenariosWithExistingTestSuites(parsedFeatures, featuresBaseDir)

      result.mergedTestSuites = fsToDbResult.mergedTestSuites
      result.addedScenarios = fsToDbResult.addedScenarios
    }

    // Step 2: Sync from database to filesystem (DB -> FS)
    console.log('🗄️ Fetching test suites from database...')
    const testSuites = await prisma.testSuite.findMany({
      include: {
        testCases: {
          include: {
            steps: {
              include: {
                parameters: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
        module: true,
      },
    })

    console.log(`Found ${testSuites.length} test suites in database`)

    // Ensure features directory exists
    await fs.mkdir(featuresBaseDir, { recursive: true })

    // Generate/update feature files for each test suite
    for (const testSuite of testSuites) {
      try {
        const featureFilePath = await generateFeatureFile(
          testSuite.id,
          testSuite.name,
          testSuite.description || undefined,
        )

        // Check if this was a new file or update
        const fileExists = await fs
          .access(featureFilePath)
          .then(() => true)
          .catch(() => false)

        if (fileExists) {
          result.updatedFeatureFiles++
        } else {
          result.generatedFeatureFiles++
        }

        console.log(`✅ Processed: ${featureFilePath}`)
      } catch (error) {
        const errorMsg = `Error processing test suite ${testSuite.name}: ${error}`
        console.error(errorMsg)
        result.errors.push(errorMsg)
      }
    }

    result.totalProcessed = testSuites.length

    console.log('\n✅ Bidirectional sync completed!')
    console.log(`📊 Summary:`)
    console.log(`   - Generated feature files: ${result.generatedFeatureFiles}`)
    console.log(`   - Updated feature files: ${result.updatedFeatureFiles}`)
    console.log(`   - Merged test suites: ${result.mergedTestSuites}`)
    console.log(`   - Added scenarios: ${result.addedScenarios}`)
    console.log(`   - Total processed: ${result.totalProcessed}`)

    if (result.errors.length > 0) {
      console.log(`   - Errors: ${result.errors.length}`)
      result.errors.forEach(error => console.log(`     - ${error}`))
    }

    return result
  } catch (error) {
    const errorMsg = `Fatal error during bidirectional sync: ${error}`
    console.error(errorMsg)
    result.errors.push(errorMsg)
    throw error
  }
}

/**
 * Performs a dry run of the bidirectional sync to show what would be changed
 * @param featuresBaseDir - Base directory for feature files
 * @returns Promise<{wouldGenerate: string[], wouldUpdate: string[], wouldCreate: any[]}>
 */
export async function performDryRunSync(featuresBaseDir: string): Promise<{
  wouldGenerate: string[]
  wouldUpdate: string[]
  wouldCreate: {
    testSuites: string[]
    testCases: string[]
    templateSteps: string[]
  }
}> {
  const wouldGenerate: string[] = []
  const wouldUpdate: string[] = []
  const wouldCreate = {
    testSuites: [] as string[],
    testCases: [] as string[],
    templateSteps: [] as string[],
  }

  try {
    console.log('🔍 Performing dry run of bidirectional sync...')

    // Check filesystem -> database sync
    const parsedFeatures = await scanFeatureFiles(featuresBaseDir)

    for (const feature of parsedFeatures) {
      const modulePath = extractModulePathFromFilePath(feature.filePath, featuresBaseDir)

      // Check if module exists
      const moduleExists = await checkModuleExists(modulePath)
      if (!moduleExists) {
        wouldCreate.testSuites.push(`Module: ${modulePath}`)
      }

      // Check if test suite exists
      const testSuiteExists = await checkTestSuiteExists(feature.featureName, modulePath)
      if (!testSuiteExists) {
        wouldCreate.testSuites.push(`Test Suite: ${feature.featureName}`)
      }

      // Check scenarios
      for (const scenario of feature.scenarios) {
        const testCaseExists = await checkTestCaseExists(scenario.name, feature.featureName, modulePath)
        if (!testCaseExists) {
          wouldCreate.testCases.push(`Test Case: ${scenario.name}`)
        }

        // Check template steps
        for (const step of scenario.steps) {
          const templateStepExists = await checkTemplateStepExists(step)
          if (!templateStepExists) {
            wouldCreate.templateSteps.push(`Template Step: ${step.keyword} ${step.text}`)
          }
        }
      }
    }

    // Check database -> filesystem sync
    const testSuites = await prisma.testSuite.findMany({
      include: {
        testCases: true,
        module: true,
      },
    })

    for (const testSuite of testSuites) {
      const expectedPath = buildExpectedFeatureFilePath(testSuite, featuresBaseDir)
      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false)

      if (fileExists) {
        wouldUpdate.push(expectedPath)
      } else {
        wouldGenerate.push(expectedPath)
      }
    }

    console.log('🔍 Dry run completed!')
    console.log(`Would generate ${wouldGenerate.length} feature files`)
    console.log(`Would update ${wouldUpdate.length} feature files`)
    console.log(`Would create ${wouldCreate.testSuites.length} test suites`)
    console.log(`Would create ${wouldCreate.testCases.length} test cases`)
    console.log(`Would create ${wouldCreate.templateSteps.length} template steps`)

    return {
      wouldGenerate,
      wouldUpdate,
      wouldCreate,
    }
  } catch (error) {
    console.error('Error during dry run:', error)
    throw error
  }
}

// Helper functions for dry run

function extractModulePathFromFilePath(featureFilePath: string, featuresBaseDir: string): string {
  const relativePath = featureFilePath.replace(featuresBaseDir, '')
  const pathParts = relativePath.split('/').filter(part => part && part !== '')
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}

async function checkModuleExists(modulePath: string): Promise<boolean> {
  try {
    const pathParts = modulePath.split('/').filter(part => part && part !== '')
    if (pathParts.length === 0) return true

    let currentParentId: string | null = null

    for (const moduleName of pathParts) {
      const foundModule: Module | null = await prisma.module.findFirst({
        where: {
          name: moduleName,
          parentId: currentParentId,
        },
      })
      if (!foundModule) return false
      currentParentId = foundModule.id
    }
    return true
  } catch {
    return false
  }
}

async function checkTestSuiteExists(featureName: string, modulePath: string): Promise<boolean> {
  try {
    const moduleId = await findModuleIdByPath(modulePath)
    if (!moduleId) return false

    const testSuite: TestSuite | null = await prisma.testSuite.findFirst({
      where: {
        name: featureName,
        moduleId: moduleId,
      },
    })

    return testSuite !== null
  } catch {
    return false
  }
}

async function checkTestCaseExists(testCaseName: string, featureName: string, modulePath: string): Promise<boolean> {
  try {
    const moduleId = await findModuleIdByPath(modulePath)
    if (!moduleId) return false

    const testSuite = await prisma.testSuite.findFirst({
      where: {
        name: featureName,
        moduleId: moduleId,
      },
    })

    if (!testSuite) return false

    const testCase = await prisma.testCase.findFirst({
      where: {
        title: testCaseName,
        TestSuite: {
          some: {
            id: testSuite.id,
          },
        },
      },
    })

    return !!testCase
  } catch {
    return false
  }
}

async function checkTemplateStepExists(step: { keyword: string; text: string }): Promise<boolean> {
  try {
    const signature = `${step.keyword} ${step.text}`
    const templateStep = await prisma.templateStep.findFirst({
      where: {
        signature: signature,
      },
    })

    return !!templateStep
  } catch {
    return false
  }
}

async function findModuleIdByPath(modulePath: string): Promise<string | null> {
  try {
    const pathParts = modulePath.split('/').filter(part => part && part !== '')
    if (pathParts.length === 0) return null

    let currentParentId: string | null = null

    for (const moduleName of pathParts) {
      const foundModule: Module | null = await prisma.module.findFirst({
        where: {
          name: moduleName,
          parentId: currentParentId,
        },
      })

      if (!foundModule) return null
      currentParentId = foundModule.id
    }

    return currentParentId
  } catch {
    return null
  }
}

function buildExpectedFeatureFilePath(testSuite: TestSuiteWithModule, featuresBaseDir: string): string {
  // This is a simplified version - in practice, you'd use the same logic as generateFeatureFile
  const modulePath = buildModulePathFromTestSuite(testSuite)
  const safeFileName = testSuite.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')

  return join(featuresBaseDir, modulePath.substring(1), `${safeFileName}.feature`)
}

function buildModulePathFromTestSuite(testSuite: TestSuiteWithModule): string {
  // Simplified module path building - in practice, you'd use the existing logic
  return `/${testSuite.module.name}`
}
