#!/usr/bin/env tsx

/**
 * Script to synchronize test cases from feature files to database
 * Scans feature files to ensure all test cases exist in DB
 * Filesystem is the source of truth - test cases in DB but not in FS will be deleted
 * Run this after merging changes to ensure test case sync
 *
 * Usage: npx tsx scripts/sync-test-cases.ts
 */

import prisma from '../src/config/db-config'
import { scanFeatureFiles, extractModulePathFromFilePath, ParsedStep } from '../src/lib/gherkin-parser'
import { buildModuleHierarchy, findModuleByPath } from '../src/lib/module-hierarchy-builder'
import { StepParameterType, TagType } from '@prisma/client'
import { ensureAutomationWorkspaceReady, getAutomationFeaturesDir } from '../src/lib/automation/paths'
import {
  determineProjectedStepIcon,
  getTestSuiteFilesystemKey,
  normalizeProjectedDbTestCaseSteps,
} from '../src/lib/sync/projected-feature-utils'
import { extractTestSuiteNameFromFilename } from './lib/filename-utils'
import { splitTagLine } from './lib/tag-parsing'
import { determineStepTypeAndIcon, findMatchingTemplateStep, sameResolvedParameters } from './lib/step-matcher'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

interface TestCaseFromFS {
  identifierTag: string // @tc_... tag
  title: string // From [brackets]
  description: string // Outside brackets
  testSuiteName: string // From feature file name
  modulePath: string // From folder structure
  filterTags: string[] // Scenario tags excluding @tc_...
  steps: ParsedStep[] // From scenario steps
  hasAppraiseMetadata: boolean
  nodes: Array<{ nodeId: string; order: number; label: string }>
  flowBlocks: Array<{ id: string; name: string; order: number; nodeIds: string[] }>
  filePath: string // Feature file path
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
        const flattenedTags = scenario.tags.flatMap(splitTagLine)
        const identifierTag = flattenedTags.find(tag => {
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
        const filterTags = flattenedTags.filter(tag => tag !== identifierTag)

        // Parse title and description from scenario name
        // Note: gherkin parser swaps them, so we pass both
        const parsedTitle = parseScenarioTitle(scenario.name, scenario.description)
        const nodesByOrder = new Map((scenario.appraiseMetadata?.nodes ?? []).map(node => [node.order, node]))

        testCases.push({
          identifierTag: identifierTag.startsWith('@') ? identifierTag : `@${identifierTag}`,
          title: scenario.appraiseMetadata?.title ?? parsedTitle.title,
          description: scenario.appraiseMetadata?.description ?? parsedTitle.description,
          testSuiteName,
          modulePath,
          filterTags,
          steps: scenario.steps.map(step => ({
            ...step,
            appraiseNode: nodesByOrder.get(step.order),
          })),
          hasAppraiseMetadata: scenario.appraiseMetadata != null,
          nodes: scenario.appraiseMetadata?.nodes ?? [],
          flowBlocks: scenario.appraiseMetadata?.flowBlocks ?? [],
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

async function deleteTestCaseWithCascade(testCaseId: string, identifierTagId?: string): Promise<void> {
  // Keep deletes in dependency order to satisfy RESTRICT constraints and
  // mirror domain-level delete behavior in a single transactional boundary.
  await prisma.$transaction(async tx => {
    await tx.testRunTestCase.deleteMany({
      where: { testCaseId },
    })
    await tx.review.deleteMany({
      where: { testCaseId },
    })
    await tx.linkedJiraTicket.deleteMany({
      where: { testCaseId },
    })
    await tx.testCaseStepParameter.deleteMany({
      where: {
        testCaseStep: { testCaseId },
      },
    })
    await tx.testCaseStep.deleteMany({
      where: { testCaseId },
    })

    if (identifierTagId) {
      const otherTestCasesWithTag = await tx.testCase.findMany({
        where: {
          tags: { some: { id: identifierTagId } },
          id: { not: testCaseId },
        },
      })
      if (otherTestCasesWithTag.length === 0) {
        await tx.tag.delete({
          where: { id: identifierTagId },
        })
      }
    }

    await tx.testCase.delete({
      where: { id: testCaseId },
    })
  })
}

/**
 * Syncs test case steps to database
 */
async function syncTestCaseSteps(
  testCaseId: string,
  steps: ParsedStep[],
  templateSteps: Array<{
    id: string
    signature: string
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
  result: SyncResult,
): Promise<void> {
  try {
    // Load current persisted step state once so we can diff by order and apply
    // minimal mutations for idempotent sync runs.
    const existingSteps = await prisma.testCaseStep.findMany({
      where: { testCaseId },
      orderBy: { order: 'asc' },
      include: {
        TemplateStep: {
          select: {
            signature: true,
          },
        },
        parameters: true,
      },
    })

    // Order is the stable identity within a scenario for synchronization.
    const existingStepsMap = new Map(existingSteps.map(step => [step.order, step]))
    const projectedExistingStepsMap = new Map(
      normalizeProjectedDbTestCaseSteps(existingSteps).map(step => [step.order, step]),
    )

    // Process each step from filesystem
    for (const step of steps) {
      const match = findMatchingTemplateStep(step, templateSteps)

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
      const label = step.appraiseNode?.label ?? step.text

      if (existingStep) {
        const expectedFlowNodeId = step.appraiseNode?.nodeId ?? existingStep.flowNodeId
        const projectedExistingStep = projectedExistingStepsMap.get(step.order)
        const matchesProjectedState =
          projectedExistingStep != null &&
          projectedExistingStep.gherkinStep === gherkinStep &&
          projectedExistingStep.label === label &&
          projectedExistingStep.icon === determineProjectedStepIcon(step.keyword) &&
          projectedExistingStep.templateStepSignature === match.signature &&
          sameResolvedParameters(projectedExistingStep.parameters, match.parameters)

        // First compare with projected state (normalizes icon/signature/params) to
        // avoid redundant writes from representational differences.
        const needsUpdate =
          !matchesProjectedState &&
          (existingStep.gherkinStep !== gherkinStep ||
            existingStep.templateStepId !== match.templateStepId ||
            existingStep.flowNodeId !== expectedFlowNodeId ||
            existingStep.label !== label ||
            existingStep.icon !== icon)

        if (needsUpdate) {
          await prisma.testCaseStep.update({
            where: { id: existingStep.id },
            data: {
              gherkinStep,
              flowNodeId: expectedFlowNodeId,
              label,
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
            flowNodeId: step.appraiseNode?.nodeId,
            label,
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

async function syncTestCaseFlowBlocks(testCaseId: string, testCase: TestCaseFromFS): Promise<void> {
  if (!testCase.hasAppraiseMetadata) {
    return
  }

  const validNodeIds = new Set(testCase.nodes.map(node => node.nodeId))

  await prisma.testCaseFlowBlock.deleteMany({
    where: { testCaseId },
  })

  if (testCase.flowBlocks.length === 0) {
    return
  }

  await prisma.testCase.update({
    where: { id: testCaseId },
    data: {
      flowBlocks: {
        create: testCase.flowBlocks.map(block => ({
          id: block.id,
          name: block.name,
          order: block.order,
          nodes: {
            create: block.nodeIds.filter(nodeId => validNodeIds.has(nodeId)).map(nodeId => ({ flowNodeId: nodeId })),
          },
        })),
      },
    },
  })
}

type TemplateStepForMatch = Array<{
  id: string
  signature: string
  parameters: Array<{ name: string; order: number; type: StepParameterType }>
}>

async function upsertTestCase(
  testCase: TestCaseFromFS,
  templateSteps: TemplateStepForMatch,
  suitesByModuleId: Map<string, Array<{ id: string; name: string }>>,
  result: SyncResult,
): Promise<void> {
  // Resolve module + suite first so create/update paths share the same identity anchor.
  // Ensure module exists
  let moduleId = await findModuleByPath(testCase.modulePath)

  if (!moduleId) {
    console.log(`   📦 Creating module hierarchy for path: ${testCase.modulePath}`)
    moduleId = await buildModuleHierarchy(testCase.modulePath)
  }

  // Find test suite
  let moduleSuites = suitesByModuleId.get(moduleId)
  if (!moduleSuites) {
    moduleSuites = await prisma.testSuite.findMany({
      where: {
        moduleId: moduleId,
      },
      select: {
        id: true,
        name: true,
      },
    })
    suitesByModuleId.set(moduleId, moduleSuites)
  }

  const testSuite = moduleSuites.find(
    suite => getTestSuiteFilesystemKey(suite.name) === getTestSuiteFilesystemKey(testCase.testSuiteName),
  )

  if (!testSuite) {
    result.errors.push(`Test suite '${testCase.testSuiteName}' not found in module '${testCase.modulePath}'`)
    console.error(`   ❌ Test suite '${testCase.testSuiteName}' not found in module '${testCase.modulePath}'`)
    return
  }

  const identifierTagName = testCase.identifierTag.startsWith('@')
    ? testCase.identifierTag.substring(1)
    : testCase.identifierTag

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

  const filterTagIds: string[] = []
  // FILTER tags are opportunistically created during test-case sync; identifier tags
  // are handled separately because they define test-case identity.
  for (const filterTagExpr of testCase.filterTags) {
    const tagId = await findOrCreateTag(filterTagExpr, TagType.FILTER)
    if (tagId) {
      filterTagIds.push(tagId)
    }
  }

  if (identifierTag && identifierTag.testCases.length > 0) {
    // Prefer a suite-matching case when tags are reused; fallback preserves legacy data.
    const matchedExistingTestCaseSummary =
      identifierTag.testCases.find(existingCase => existingCase.TestSuite.some(suite => suite.id === testSuite.id)) ??
      identifierTag.testCases[0]
    const existingTestCase = await prisma.testCase.findUnique({
      where: { id: matchedExistingTestCaseSummary.id },
      include: {
        tags: true,
        TestSuite: true,
      },
    })

    if (!existingTestCase) {
      result.errors.push(`Test case with identifier tag '${testCase.identifierTag}' not found`)
      return
    }

    const currentFilterTagIds =
      existingTestCase.tags
        .filter(t => t.type === TagType.FILTER)
        .map(t => t.id)
        .sort() || []

    const newFilterTagIds = filterTagIds.sort()
    const tagsChanged = JSON.stringify(currentFilterTagIds) !== JSON.stringify(newFilterTagIds)
    const isAssociated = existingTestCase.TestSuite.some(ts => ts.id === testSuite.id)

    const needsUpdate =
      existingTestCase.title !== testCase.title ||
      existingTestCase.description !== testCase.description ||
      tagsChanged ||
      !isAssociated

    if (needsUpdate) {
      await prisma.testCase.update({
        where: { id: existingTestCase.id },
        data: {
          title: testCase.title,
          description: testCase.description,
          tags: {
            set: [identifierTag.id, ...filterTagIds].map(id => ({ id })),
          },
          TestSuite: isAssociated
            ? undefined
            : {
                connect: [{ id: testSuite.id }],
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

    await syncTestCaseSteps(existingTestCase.id, testCase.steps, templateSteps, result)
    await syncTestCaseFlowBlocks(existingTestCase.id, testCase)
    return
  }

  const identifierTagId = await findOrCreateTag(testCase.identifierTag, TagType.IDENTIFIER)

  if (!identifierTagId) {
    result.errors.push(`Failed to create identifier tag '${testCase.identifierTag}'`)
    console.error(`   ❌ Failed to create identifier tag '${testCase.identifierTag}'`)
    return
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

  await syncTestCaseSteps(newTestCase.id, testCase.steps, templateSteps, result)
  await syncTestCaseFlowBlocks(newTestCase.id, testCase)
}

async function deleteOrphanedTestCases(fsTestCaseTags: Set<string>, result: SyncResult): Promise<void> {
  console.log('\n🔍 Checking for orphaned test cases (not in filesystem)...')
  const allDbTestCases = await prisma.testCase.findMany({
    include: {
      tags: true,
    },
  })

  for (const dbTestCase of allDbTestCases) {
    try {
      const identifierTag = dbTestCase.tags.find(t => t.type === TagType.IDENTIFIER)

      if (!identifierTag) {
        console.log(`   ⚠️  Test case '${dbTestCase.title}' has no identifier tag - will be deleted as orphaned`)
        await deleteTestCaseWithCascade(dbTestCase.id)
        result.testCasesDeleted++
        result.deletedTestCases.push({
          identifierTag: '(no identifier tag)',
          title: dbTestCase.title,
        })
        console.log(`   🗑️  Deleted test case '${dbTestCase.title}' (no identifier tag)`)
        continue
      }

      const identifierTagExpr = normalizeTagExpression(identifierTag.tagExpression)
      // Compare normalized expressions because filesystem tags are always normalized
      // with '@', while historical DB entries may not be.
      if (!fsTestCaseTags.has(identifierTagExpr)) {
        const testRunTestCases = await prisma.testRunTestCase.findMany({
          where: { testCaseId: dbTestCase.id },
        })

        if (testRunTestCases.length > 0) {
          console.log(
            `   ⚠️  Test case '${dbTestCase.title}' (${identifierTagExpr}) has ${testRunTestCases.length} test run(s) - will be deleted`,
          )
        }

        await deleteTestCaseWithCascade(dbTestCase.id, identifierTag.id)

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
 * Syncs test cases from filesystem to database
 */
async function syncTestCasesToDatabase(testCasesFromFS: TestCaseFromFS[], result: SyncResult): Promise<void> {
  console.log('\n✅ Syncing test cases to database...')
  // Fixes prior N+1 behavior: template steps are loaded once and reused for
  // every gherkin step match in this sync run.
  const templateSteps = await prisma.templateStep.findMany({
    include: {
      parameters: {
        orderBy: { order: 'asc' },
      },
    },
  })

  // Track test cases from filesystem (by identifier tag)
  const fsTestCaseTags = new Set<string>()
  const suitesByModuleId = new Map<string, Array<{ id: string; name: string }>>()

  for (const testCase of testCasesFromFS) {
    try {
      fsTestCaseTags.add(testCase.identifierTag)
      await upsertTestCase(testCase, templateSteps, suitesByModuleId, result)
    } catch (error) {
      const errorMsg = `Error processing test case '${testCase.title}' from ${testCase.filePath}: ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }
  await deleteOrphanedTestCases(fsTestCaseTags, result)
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult | void> {
  console.log('🔄 Starting test cases sync...')
  console.log('This will scan feature files and sync test cases to database.')
  console.log('Filesystem is the source of truth - test cases in DB but not in FS will be deleted.\n')

  await ensureAutomationWorkspaceReady()
  const featuresDir = getAutomationFeaturesDir()

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

  printSyncSummary(
    [
      { label: '📁 Test cases scanned', value: result.testCasesScanned },
      { label: '✅ Test cases existing', value: result.testCasesExisting },
      { label: '➕ Test cases created', value: result.testCasesCreated },
      { label: '🔄 Test cases updated', value: result.testCasesUpdated },
      { label: '🗑️  Test cases deleted', value: result.testCasesDeleted },
      { label: '⚠️  Warnings', value: result.warnings.length },
      { label: '❌ Errors', value: result.errors.length },
    ],
    [
      {
        title: 'Created test cases',
        items: result.createdTestCases.map(tc => `${tc.title} (${tc.identifierTag})`),
      },
      {
        title: 'Updated test cases',
        items: result.updatedTestCases.map(tc => `${tc.title} (${tc.identifierTag})`),
      },
      {
        title: 'Deleted test cases',
        items: result.deletedTestCases.map(tc => `${tc.title} (${tc.identifierTag})`),
      },
      { title: 'Warnings', items: result.warnings },
      { title: 'Errors', items: result.errors },
    ],
  )
  return result
}

runSyncScript(main)
