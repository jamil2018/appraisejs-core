#!/usr/bin/env tsx

/**
 * Script to synchronize test cases from feature files to database
 * Scans feature files to ensure all test cases exist in DB
 * Filesystem is the source of truth - test cases in DB but not in FS will be deleted
 * Run this after merging changes to ensure test case sync
 *
 * Usage: npx tsx scripts/sync-test-cases.ts
 */

import { join } from 'path'
import prisma from '../src/config/db-config'
import {
  scanFeatureFiles,
  extractModulePathFromFilePath,
  ParsedStep,
} from '../src/lib/gherkin-parser'
import { buildModuleHierarchy, findModuleByPath } from '../src/lib/module-hierarchy-builder'
import { TemplateStepType, TemplateStepIcon, StepParameterType, TagType } from '@prisma/client'

interface TestCaseFromFS {
  identifierTag: string // @tc_... tag
  title: string // From [brackets]
  description: string // Outside brackets
  testSuiteName: string // From feature file name
  modulePath: string // From folder structure
  filterTags: string[] // Scenario tags excluding @tc_...
  steps: ParsedStep[] // From scenario steps
  filePath: string // Feature file path
}

interface ParameterMatch {
  name: string
  value: string
  order: number
  type: StepParameterType
}

interface TemplateStepMatch {
  templateStepId: string
  parameters: ParameterMatch[]
}

interface SyncResult {
  testCasesScanned: number
  testCasesExisting: number
  testCasesCreated: number
  testCasesUpdated: number
  testCasesDeleted: number
  errors: string[]
  warnings: string[]
  createdTestCases: Array<{ identifierTag: string; title: string }>
  updatedTestCases: Array<{ identifierTag: string; title: string }>
  deletedTestCases: Array<{ identifierTag: string; title: string }>
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
 * Normalizes a tag expression to ensure it has the @ prefix
 * Example: "tc_123" -> "@tc_123", "@tc_123" -> "@tc_123"
 */
function normalizeTagExpression(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression : `@${tagExpression}`
}

/**
 * Parses scenario title to extract title and description
 * Note: The gherkin parser already extracts these but swaps them
 * Format: [Title] Description
 * Example: "[Login] Validate login page navigation"
 * The parser returns: name="Validate login page navigation", description="Login"
 * We need: title="Login", description="Validate login page navigation"
 */
function parseScenarioTitle(
  scenarioName: string,
  scenarioDescription?: string,
): { title: string; description: string } {
  // If description exists, it means there was a [bracket] in the original
  // The parser swapped them, so description is the title and name is the description
  if (scenarioDescription) {
    return {
      title: scenarioDescription.trim(),
      description: scenarioName.trim(),
    }
  }
  // If no description, there were no brackets, use name as description
  return {
    title: scenarioName.trim(),
    description: '',
  }
}

/**
 * Scans feature files and extracts test case information
 */
async function scanTestCasesFromFilesystem(featuresDir: string): Promise<TestCaseFromFS[]> {
  const testCases: TestCaseFromFS[] = []

  console.log('📁 Scanning feature files...')
  const parsedFeatures = await scanFeatureFiles(featuresDir)
  console.log(`   Found ${parsedFeatures.length} feature file(s)`)

  for (const parsedFeature of parsedFeatures) {
    try {
      const testSuiteName = extractTestSuiteNameFromFilename(parsedFeature.filePath)
      const modulePath = extractModulePathFromFilePath(parsedFeature.filePath, featuresDir)

      for (const scenario of parsedFeature.scenarios) {
        // Find identifier tag (@tc_...)
        const identifierTag = scenario.tags.find(tag => {
          const tagName = tag.startsWith('@') ? tag.substring(1) : tag
          return tagName.startsWith('tc_')
        })

        if (!identifierTag) {
          console.log(
            `   ⚠️  Scenario "${scenario.name}" in ${parsedFeature.filePath} has no @tc_... identifier tag, skipping`,
          )
          continue
        }

        // Extract filter tags (all tags except identifier tag)
        const filterTags = scenario.tags.filter(tag => tag !== identifierTag).flatMap(tag => splitTagLine(tag))

        // Parse title and description from scenario name
        // Note: gherkin parser swaps them, so we pass both
        const { title, description } = parseScenarioTitle(scenario.name, scenario.description)

        testCases.push({
          identifierTag: identifierTag.startsWith('@') ? identifierTag : `@${identifierTag}`,
          title,
          description,
          testSuiteName,
          modulePath,
          filterTags,
          steps: scenario.steps,
          filePath: parsedFeature.filePath,
        })
      }
    } catch (error) {
      console.error(`   ❌ Error processing feature file '${parsedFeature.filePath}': ${error}`)
    }
  }

  return testCases
}

/**
 * Converts template step signature to regex pattern
 * Replaces placeholders like {string}, {int}, {boolean} with regex patterns
 */
function signatureToRegex(signature: string): RegExp {
  // Escape special regex characters except placeholders
  let pattern = signature.replace(/[.*+?^${}()|[\]\\]/g, match => {
    // Don't escape { and } as they're our placeholders
    if (match === '{' || match === '}') return match
    return '\\' + match
  })

  // Replace placeholders with regex patterns
  pattern = pattern.replace(/\{string\}/g, '"([^"]+)"') // Matches quoted strings
  pattern = pattern.replace(/\{int\}/g, '(\\d+)') // Matches integers
  pattern = pattern.replace(/\{boolean\}/g, '(true|false)') // Matches booleans
  pattern = pattern.replace(/\{number\}/g, '(\\d+(?:\\.\\d+)?)') // Matches numbers (int or float)

  // Create regex with case-insensitive matching and word boundaries
  return new RegExp(`^${pattern}$`, 'i')
}

/**
 * Extracts parameters from gherkin step text based on template step signature
 */
function extractParametersFromGherkinStep(
  gherkinText: string,
  signature: string,
  templateStepParameters: Array<{ name: string; order: number; type: StepParameterType }>,
): ParameterMatch[] | null {
  const regex = signatureToRegex(signature)
  const match = gherkinText.match(regex)

  if (!match) {
    return null
  }

  // Extract captured groups (skip index 0 which is the full match)
  const capturedValues = match.slice(1)
  const parameters: ParameterMatch[] = []

  // Map captured values to template step parameters by order
  for (let i = 0; i < capturedValues.length && i < templateStepParameters.length; i++) {
    const param = templateStepParameters[i]
    const value = capturedValues[i]

    if (value !== undefined) {
      parameters.push({
        name: param.name,
        value: value,
        order: param.order,
        type: param.type,
      })
    }
  }

  return parameters
}

/**
 * Matches a gherkin step to a template step by pattern matching
 * Returns the template step ID and extracted parameters, or null if no match found
 * Note: Template step signatures don't include the keyword, so we match against step.text only
 */
async function matchGherkinStepToTemplateStep(gherkinStep: ParsedStep): Promise<TemplateStepMatch | null> {
  try {
    // Get all template steps from database
    const templateSteps = await prisma.templateStep.findMany({
      include: {
        parameters: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    })

    // Try to match against each template step signature
    // Template step signatures don't include the keyword, so match against step.text
    for (const templateStep of templateSteps) {
      // Try to match the gherkin step text (without keyword) against the signature
      const parameters = extractParametersFromGherkinStep(
        gherkinStep.text,
        templateStep.signature,
        templateStep.parameters.map(p => ({
          name: p.name,
          order: p.order,
          type: p.type,
        })),
      )

      if (parameters !== null) {
        return {
          templateStepId: templateStep.id,
          parameters,
        }
      }
    }

    return null
  } catch (error) {
    console.error(`Error matching gherkin step to template step:`, error)
    return null
  }
}

/**
 * Determines the step type and icon based on the Gherkin keyword
 */
function determineStepTypeAndIcon(keyword: string): { type: TemplateStepType; icon: TemplateStepIcon } {
  const lowerKeyword = keyword.toLowerCase().trim()

  if (lowerKeyword === 'given') {
    return { type: 'ACTION', icon: 'NAVIGATION' }
  } else if (lowerKeyword === 'when') {
    return { type: 'ACTION', icon: 'MOUSE' }
  } else if (lowerKeyword === 'then') {
    return { type: 'ASSERTION', icon: 'VALIDATION' }
  } else if (lowerKeyword === 'and' || lowerKeyword === 'but') {
    return { type: 'ACTION', icon: 'MOUSE' }
  } else {
    // Default fallback
    return { type: 'ACTION', icon: 'MOUSE' }
  }
}

/**
 * Finds or creates a tag by tag expression
 * If the tag exists but has a different type, updates it to the correct type
 */
async function findOrCreateTag(tagExpression: string, type: TagType): Promise<string | null> {
  try {
    const tagName = tagExpression.startsWith('@') ? tagExpression.substring(1) : tagExpression

    const existingTag = await prisma.tag.findFirst({
      where: { tagExpression },
    })

    if (existingTag) {
      // If the tag exists but has a different type, update it
      // This is important because tags might have been created with the wrong type previously
      if (existingTag.type !== type) {
        await prisma.tag.update({
          where: { id: existingTag.id },
          data: { type },
        })
        console.log(`   🔄 Updated tag '${tagExpression}' type from ${existingTag.type} to ${type}`)
      }
      return existingTag.id
    }

    const newTag = await prisma.tag.create({
      data: {
        name: tagName,
        tagExpression,
        type,
      },
    })

    return newTag.id
  } catch (error) {
    console.error(`Error finding/creating tag '${tagExpression}': ${error}`)
    return null
  }
}

/**
 * Syncs test case steps to database
 */
async function syncTestCaseSteps(testCaseId: string, steps: ParsedStep[], result: SyncResult): Promise<void> {
  try {
    // Get existing steps
    const existingSteps = await prisma.testCaseStep.findMany({
      where: { testCaseId },
      orderBy: { order: 'asc' },
      include: {
        parameters: true,
      },
    })

    // Create a map of existing steps by order
    const existingStepsMap = new Map(existingSteps.map(step => [step.order, step]))

    // Process each step from filesystem
    for (const step of steps) {
      const match = await matchGherkinStepToTemplateStep(step)

      if (!match) {
        result.warnings.push(
          `Could not match gherkin step "${step.keyword} ${step.text}" to any template step for test case ${testCaseId}`,
        )
        console.log(`   ⚠️  Skipping step "${step.keyword} ${step.text}" - no template step match found`)
        continue
      }

      const existingStep = existingStepsMap.get(step.order)
      const { icon } = determineStepTypeAndIcon(step.keyword)
      const gherkinStep = `${step.keyword} ${step.text}`

      if (existingStep) {
        // Update existing step if needed
        const needsUpdate =
          existingStep.gherkinStep !== gherkinStep ||
          existingStep.templateStepId !== match.templateStepId ||
          existingStep.label !== step.text

        if (needsUpdate) {
          await prisma.testCaseStep.update({
            where: { id: existingStep.id },
            data: {
              gherkinStep,
              label: step.text,
              templateStepId: match.templateStepId,
              icon,
            },
          })

          // Update parameters
          await prisma.testCaseStepParameter.deleteMany({
            where: { testCaseStepId: existingStep.id },
          })

          for (const param of match.parameters) {
            await prisma.testCaseStepParameter.create({
              data: {
                testCaseStepId: existingStep.id,
                name: param.name,
                value: param.value,
                order: param.order,
                type: param.type,
              },
            })
          }
        }
      } else {
        // Create new step
        const newStep = await prisma.testCaseStep.create({
          data: {
            testCaseId,
            order: step.order,
            gherkinStep,
            label: step.text,
            icon,
            templateStepId: match.templateStepId,
          },
        })

        // Create parameters
        for (const param of match.parameters) {
          await prisma.testCaseStepParameter.create({
            data: {
              testCaseStepId: newStep.id,
              name: param.name,
              value: param.value,
              order: param.order,
              type: param.type,
            },
          })
        }
      }
    }

    // Delete steps that no longer exist in filesystem
    const fsStepOrders = new Set(steps.map(s => s.order))
    for (const existingStep of existingSteps) {
      if (!fsStepOrders.has(existingStep.order)) {
        await prisma.testCaseStep.delete({
          where: { id: existingStep.id },
        })
      }
    }
  } catch (error) {
    const errorMsg = `Error syncing steps for test case ${testCaseId}: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

/**
 * Syncs test cases from filesystem to database
 */
async function syncTestCasesToDatabase(testCasesFromFS: TestCaseFromFS[], result: SyncResult): Promise<void> {
  console.log('\n✅ Syncing test cases to database...')

  // Track test cases from filesystem (by identifier tag)
  const fsTestCaseTags = new Set<string>()

  for (const testCase of testCasesFromFS) {
    try {
      fsTestCaseTags.add(testCase.identifierTag)

      // Ensure module exists
      let moduleId = await findModuleByPath(testCase.modulePath)

      if (!moduleId) {
        console.log(`   📦 Creating module hierarchy for path: ${testCase.modulePath}`)
        moduleId = await buildModuleHierarchy(testCase.modulePath)
      }

      // Find test suite
      const testSuite = await prisma.testSuite.findFirst({
        where: {
          name: testCase.testSuiteName,
          moduleId: moduleId,
        },
      })

      if (!testSuite) {
        result.errors.push(`Test suite '${testCase.testSuiteName}' not found in module '${testCase.modulePath}'`)
        console.error(`   ❌ Test suite '${testCase.testSuiteName}' not found in module '${testCase.modulePath}'`)
        continue
      }

      // Find identifier tag
      const identifierTagName = testCase.identifierTag.startsWith('@')
        ? testCase.identifierTag.substring(1)
        : testCase.identifierTag

      // Find test case by identifier tag
      const identifierTag = await prisma.tag.findFirst({
        where: {
          name: identifierTagName,
          type: TagType.IDENTIFIER,
        },
        include: {
          testCases: {
            include: {
              TestSuite: true,
            },
          },
        },
      })

      // Find filter tag IDs
      const filterTagIds: string[] = []
      for (const filterTagExpr of testCase.filterTags) {
        const tagId = await findOrCreateTag(filterTagExpr, TagType.FILTER)
        if (tagId) {
          filterTagIds.push(tagId)
        }
      }

      if (identifierTag && identifierTag.testCases.length > 0) {
        // Test case exists - update it
        const existingTestCase = await prisma.testCase.findUnique({
          where: { id: identifierTag.testCases[0].id },
          include: {
            tags: true,
            TestSuite: true,
          },
        })

        if (!existingTestCase) {
          result.errors.push(`Test case with identifier tag '${testCase.identifierTag}' not found`)
          continue
        }

        // Check if update is needed
        const currentFilterTagIds =
          existingTestCase.tags
            .filter(t => t.type === TagType.FILTER)
            .map(t => t.id)
            .sort() || []

        const newFilterTagIds = filterTagIds.sort()
        const tagsChanged = JSON.stringify(currentFilterTagIds) !== JSON.stringify(newFilterTagIds)

        const needsUpdate =
          existingTestCase.title !== testCase.title ||
          existingTestCase.description !== testCase.description ||
          tagsChanged

        if (needsUpdate) {
          // Check if test case is already associated with this test suite
          const isAssociated = existingTestCase.TestSuite.some(ts => ts.id === testSuite.id)

          await prisma.testCase.update({
            where: { id: existingTestCase.id },
            data: {
              title: testCase.title,
              description: testCase.description,
              tags: {
                set: [identifierTag.id, ...filterTagIds].map(id => ({ id })),
              },
              TestSuite: isAssociated
                ? undefined // Don't change associations if already connected
                : {
                    connect: [{ id: testSuite.id }], // Add test suite if not already connected
                  },
            },
          })

          result.testCasesUpdated++
          result.updatedTestCases.push({
            identifierTag: testCase.identifierTag,
            title: testCase.title,
          })
          console.log(`   🔄 Updated test case '${testCase.title}' (${testCase.identifierTag})`)
        } else {
          result.testCasesExisting++
          console.log(`   ✓ Test case '${testCase.title}' (${testCase.identifierTag}) already up to date`)
        }

        // Sync steps
        await syncTestCaseSteps(existingTestCase.id, testCase.steps, result)
      } else {
        // Test case doesn't exist - create it
        // First ensure identifier tag exists
        const identifierTagId = await findOrCreateTag(testCase.identifierTag, TagType.IDENTIFIER)

        if (!identifierTagId) {
          result.errors.push(`Failed to create identifier tag '${testCase.identifierTag}'`)
          console.error(`   ❌ Failed to create identifier tag '${testCase.identifierTag}'`)
          continue
        }

        const newTestCase = await prisma.testCase.create({
          data: {
            title: testCase.title,
            description: testCase.description,
            tags: {
              connect: [identifierTagId, ...filterTagIds].map(id => ({ id })),
            },
            TestSuite: {
              connect: [{ id: testSuite.id }],
            },
          },
          include: {
            tags: true,
          },
        })

        // Verify identifier tag is associated
        const hasIdentifierTag = newTestCase.tags.some(t => t.type === TagType.IDENTIFIER)
        if (!hasIdentifierTag) {
          result.errors.push(
            `Test case '${testCase.title}' was created but identifier tag '${testCase.identifierTag}' was not associated`,
          )
          console.error(
            `   ❌ Test case '${testCase.title}' was created but identifier tag '${testCase.identifierTag}' was not associated`,
          )
        }

        result.testCasesCreated++
        result.createdTestCases.push({
          identifierTag: testCase.identifierTag,
          title: testCase.title,
        })
        console.log(`   ➕ Created test case '${testCase.title}' (${testCase.identifierTag})`)

        // Sync steps
        await syncTestCaseSteps(newTestCase.id, testCase.steps, result)
      }
    } catch (error) {
      const errorMsg = `Error processing test case '${testCase.title}' from ${testCase.filePath}: ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  // Delete orphaned test cases (test cases in DB but not in FS)
  console.log('\n🔍 Checking for orphaned test cases (not in filesystem)...')
  const allDbTestCases = await prisma.testCase.findMany({
    include: {
      tags: true, // Include all tags, not just identifier tags
    },
  })

  for (const dbTestCase of allDbTestCases) {
    try {
      const identifierTag = dbTestCase.tags.find(t => t.type === TagType.IDENTIFIER)

      // Test cases without identifier tags cannot be synced from filesystem
      // and should be deleted as orphaned
      if (!identifierTag) {
        console.log(`   ⚠️  Test case '${dbTestCase.title}' has no identifier tag - will be deleted as orphaned`)

        // Delete the test case and all related records in a transaction
        await prisma.$transaction(async tx => {
          // Delete all test run test cases (has RESTRICT constraint, must be deleted first)
          await tx.testRunTestCase.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all reviews
          await tx.review.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all linked Jira tickets
          await tx.linkedJiraTicket.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all step parameters
          await tx.testCaseStepParameter.deleteMany({
            where: {
              testCaseStep: {
                testCaseId: dbTestCase.id,
              },
            },
          })

          // Delete all test case steps
          await tx.testCaseStep.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete the test case
          await tx.testCase.delete({
            where: { id: dbTestCase.id },
          })
        })

        result.testCasesDeleted++
        result.deletedTestCases.push({
          identifierTag: '(no identifier tag)',
          title: dbTestCase.title,
        })
        console.log(`   🗑️  Deleted test case '${dbTestCase.title}' (no identifier tag)`)
        continue
      }

      // Normalize tagExpression to ensure consistent format comparison
      // fsTestCaseTags contains normalized tags (with @ prefix), so we need to normalize
      // the database tagExpression before comparing
      const identifierTagExpr = normalizeTagExpression(identifierTag.tagExpression)
      if (!fsTestCaseTags.has(identifierTagExpr)) {
        // Check if test case has test runs (for logging)
        const testRunTestCases = await prisma.testRunTestCase.findMany({
          where: { testCaseId: dbTestCase.id },
        })

        if (testRunTestCases.length > 0) {
          console.log(
            `   ⚠️  Test case '${dbTestCase.title}' (${identifierTagExpr}) has ${testRunTestCases.length} test run(s) - will be deleted`,
          )
        }

        // Delete the test case and all related records in a transaction
        // Following the same pattern as deleteTestCaseAction
        await prisma.$transaction(async tx => {
          // Delete all test run test cases (has RESTRICT constraint, must be deleted first)
          await tx.testRunTestCase.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all reviews
          await tx.review.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all linked Jira tickets
          await tx.linkedJiraTicket.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete all step parameters
          await tx.testCaseStepParameter.deleteMany({
            where: {
              testCaseStep: {
                testCaseId: dbTestCase.id,
              },
            },
          })

          // Delete all test case steps
          await tx.testCaseStep.deleteMany({
            where: {
              testCaseId: dbTestCase.id,
            },
          })

          // Delete the identifier tag (only if it's not used by other test cases)
          // Check if any other test case uses this tag
          const otherTestCasesWithTag = await tx.testCase.findMany({
            where: {
              tags: {
                some: {
                  id: identifierTag.id,
                },
              },
              id: {
                not: dbTestCase.id,
              },
            },
          })

          if (otherTestCasesWithTag.length === 0) {
            await tx.tag.delete({
              where: { id: identifierTag.id },
            })
          }

          // Delete the test case
          await tx.testCase.delete({
            where: { id: dbTestCase.id },
          })
        })

        result.testCasesDeleted++
        result.deletedTestCases.push({
          identifierTag: identifierTagExpr,
          title: dbTestCase.title,
        })
        console.log(`   🗑️  Deleted test case '${dbTestCase.title}' (${identifierTagExpr}) (not in filesystem)`)
      }
    } catch (error) {
      const errorMsg = `Error deleting test case '${dbTestCase.title}': ${error}`
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
  console.log(`   📁 Test cases scanned: ${result.testCasesScanned}`)
  console.log(`   ✅ Test cases existing: ${result.testCasesExisting}`)
  console.log(`   ➕ Test cases created: ${result.testCasesCreated}`)
  console.log(`   🔄 Test cases updated: ${result.testCasesUpdated}`)
  console.log(`   🗑️  Test cases deleted: ${result.testCasesDeleted}`)
  console.log(`   ⚠️  Warnings: ${result.warnings.length}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdTestCases.length > 0) {
    console.log('\n   Created test cases:')
    result.createdTestCases.forEach((tc, index) => {
      console.log(`      ${index + 1}. ${tc.title} (${tc.identifierTag})`)
    })
  }

  if (result.updatedTestCases.length > 0) {
    console.log('\n   Updated test cases:')
    result.updatedTestCases.forEach((tc, index) => {
      console.log(`      ${index + 1}. ${tc.title} (${tc.identifierTag})`)
    })
  }

  if (result.deletedTestCases.length > 0) {
    console.log('\n   Deleted test cases:')
    result.deletedTestCases.forEach((tc, index) => {
      console.log(`      ${index + 1}. ${tc.title} (${tc.identifierTag})`)
    })
  }

  if (result.warnings.length > 0) {
    console.log('\n   Warnings:')
    result.warnings.forEach((warning, index) => {
      console.log(`      ${index + 1}. ${warning}`)
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
    console.log('🔄 Starting test cases sync...')
    console.log('This will scan feature files and sync test cases to database.')
    console.log('Filesystem is the source of truth - test cases in DB but not in FS will be deleted.\n')

    const baseDir = process.cwd()
    const featuresDir = join(baseDir, 'src', 'tests', 'features')

    // Scan test cases from filesystem
    const testCasesFromFS = await scanTestCasesFromFilesystem(featuresDir)

    if (testCasesFromFS.length === 0) {
      console.log('\n⚠️  No test cases found in feature files. Nothing to sync.')
      return
    }

    console.log(`\n📋 Found ${testCasesFromFS.length} test case(s) from feature files:`)
    for (const tc of testCasesFromFS) {
      console.log(`   - ${tc.title} (${tc.identifierTag}) in ${tc.testSuiteName}`)
    }

    // Initialize result
    const result: SyncResult = {
      testCasesScanned: testCasesFromFS.length,
      testCasesExisting: 0,
      testCasesCreated: 0,
      testCasesUpdated: 0,
      testCasesDeleted: 0,
      errors: [],
      warnings: [],
      createdTestCases: [],
      updatedTestCases: [],
      deletedTestCases: [],
    }

    // Sync to database
    await syncTestCasesToDatabase(testCasesFromFS, result)

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
