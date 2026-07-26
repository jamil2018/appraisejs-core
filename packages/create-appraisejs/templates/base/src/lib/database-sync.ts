import prisma from '@/config/db-config'
import { ParsedFeature, ParsedStep } from './gherkin-parser'
import { buildModuleHierarchy } from './module-hierarchy-builder'
import { Prisma, StepIcon, TestCase, TagType } from '@prisma/client'
import { getTagTypeFromExpression } from './tag-identifiers'
import { getFeatureModulePath } from './path-helpers/feature-path'
import { parseGherkinScenarioTitle } from './gherkin-scenario-title'
import { getTestSuiteFilesystemKey } from './sync/projected-feature-utils'
import {
  canonicalStepDefinitionJson,
  stepInvocationSchema,
  validateStepInvocationInputs,
} from '../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'

type SyncClient = Prisma.TransactionClient

function splitTagLine(tagLine: string): string[] {
  return tagLine
    .split(/\s+/)
    .filter(tag => tag.trim().startsWith('@'))
    .map(tag => tag.trim())
}

function flattenFeatureTags(tags: string[]): string[] {
  return tags.flatMap(tag => (tag.startsWith('@') ? splitTagLine(tag) : [tag]))
}

function extractTestSuiteNameFromFilename(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  return fileName.replace(/\.feature$/, '')
}

/**
 * Determines the tag type based on the tag expression pattern
 * Pattern: @xx_id_xxxxxxxx where xx is any 2 chars, xxxxxxxx is any chars
 * @param tagExpression - The tag expression (e.g., "@tc_id_ue4qwoml" or "@smoke")
 * @returns TagType - IDENTIFIER if matches pattern, FILTER otherwise
 */
function determineTagType(tagExpression: string): TagType {
  return getTagTypeFromExpression(tagExpression)
}

/**
 * Derives the tag name from the tag expression by removing the @ symbol
 * @param tagExpression - The tag expression (e.g., "@smoke")
 * @returns string - The tag name without @ (e.g., "smoke")
 */
function deriveTagName(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression.substring(1) : tagExpression
}

/**
 * Finds or creates a tag in the database
 * If the tag exists, updates its type if it differs from the expected type
 * @param tagExpression - The tag expression (e.g., "@smoke")
 * @returns Promise<string> - The tag ID
 */
async function findOrCreateTag(tagExpression: string, client: SyncClient): Promise<string> {
  try {
    // Find existing tag by tagExpression
    const existingTag = await client.tag.findFirst({
      where: {
        tagExpression: tagExpression,
      },
    })

    const expectedType = determineTagType(tagExpression)
    const tagName = deriveTagName(tagExpression)

    if (existingTag) {
      // Update type if it differs from expected type
      if (existingTag.type !== expectedType) {
        await client.tag.update({
          where: { id: existingTag.id },
          data: { type: expectedType },
        })
        console.log(`Updated tag type for ${tagExpression} from ${existingTag.type} to ${expectedType}`)
      }
      return existingTag.id
    }

    // Create new tag
    const newTag = await client.tag.create({
      data: {
        name: tagName,
        tagExpression: tagExpression,
        type: expectedType,
      },
    })

    console.log(`Created tag: ${tagExpression} (${expectedType})`)
    return newTag.id
  } catch (error) {
    console.error(`Error finding/creating tag ${tagExpression}:`, error)
    throw error
  }
}

/**
 * Finds or creates a test suite
 */
async function findOrCreateTestSuite(
  name: string,
  description: string | undefined,
  moduleId: string,
  client: SyncClient,
  tags?: string[],
): Promise<string | null> {
  try {
    // Try to find existing test suite
    const existingTestSuite = await client.testSuite.findFirst({
      where: {
        name: name,
        moduleId: moduleId,
      },
      include: {
        tags: true,
      },
    })

    if (existingTestSuite) {
      // Associate tags if provided
      if (tags && tags.length > 0) {
        const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag, client)))
        await client.testSuite.update({
          where: { id: existingTestSuite.id },
          data: {
            tags: {
              connect: tagIds.map(id => ({ id })),
            },
          },
        })
      }
      return existingTestSuite.id
    }

    // Create new test suite with tags
    const tagIds = tags && tags.length > 0 ? await Promise.all(tags.map(tag => findOrCreateTag(tag, client))) : []

    const newTestSuite = await client.testSuite.create({
      data: {
        name: name,
        description: description || null,
        moduleId: moduleId,
        tags: tagIds.length > 0 ? { connect: tagIds.map(id => ({ id })) } : undefined,
      },
    })

    console.log(`Created test suite: ${name}`)
    return newTestSuite.id
  } catch (error) {
    console.error(`Error creating test suite ${name}:`, error)
    return null
  }
}

/**
 * Finds or creates a test case
 */
async function findOrCreateTestCase(
  title: string,
  description: string,
  testSuiteId: string,
  client: SyncClient,
  tags?: string[],
): Promise<string | null> {
  try {
    // Try to find existing test case
    const existingTestCase: TestCase | null = await client.testCase.findFirst({
      where: {
        title: title,
        TestSuite: {
          some: {
            id: testSuiteId,
          },
        },
      },
      include: {
        tags: true,
      },
    })

    if (existingTestCase) {
      // Associate tags if provided
      if (tags && tags.length > 0) {
        const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag, client)))
        await client.testCase.update({
          where: { id: existingTestCase.id },
          data: {
            tags: {
              connect: tagIds.map(id => ({ id })),
            },
          },
        })
      }
      return existingTestCase.id
    }

    // Create new test case with tags
    const tagIds = tags && tags.length > 0 ? await Promise.all(tags.map(tag => findOrCreateTag(tag, client))) : []

    const newTestCase = await client.testCase.create({
      data: {
        title: title,
        description: description,
        TestSuite: {
          connect: {
            id: testSuiteId,
          },
        },
        tags: tagIds.length > 0 ? { connect: tagIds.map(id => ({ id })) } : undefined,
      },
    })

    console.log(`Created test case: ${title}`)
    return newTestCase.id
  } catch (error) {
    console.error(`Error creating test case ${title}:`, error)
    return null
  }
}

/**
 * Determines the step type and icon based on the Gherkin keyword
 */
function determineStepTypeAndIcon(keyword: string): { icon: StepIcon } {
  const lowerKeyword = keyword.toLowerCase().trim()

  if (lowerKeyword === 'given') {
    return { icon: 'NAVIGATION' }
  } else if (lowerKeyword === 'when') {
    return { icon: 'MOUSE' }
  } else if (lowerKeyword === 'then') {
    return { icon: 'VALIDATION' }
  } else if (lowerKeyword === 'and' || lowerKeyword === 'but') {
    return { icon: 'MOUSE' }
  } else {
    // Default fallback
    return { icon: 'MOUSE' }
  }
}

/**
 * Creates or updates a test case step
 */
export async function createOrUpdateTestCaseStep(
  testCaseId: string,
  step: ParsedStep,
  client: SyncClient,
): Promise<void> {
  const metadataNode = step.appraiseNode
  if (!metadataNode?.invocation) {
    throw new Error(
      `Feature import requires an exact Step Invocation in Appraise metadata for ${step.keyword} ${step.text}; it will not infer or create a Step Definition.`,
    )
  }
  const invocation = stepInvocationSchema.parse(metadataNode.invocation)
  const definitions = await resolveReadyExactStepDefinitions([{ invocation }], client)
  if (!definitions) {
    throw new Error(`Feature import references an unavailable exact Step Definition for ${step.keyword} ${step.text}.`)
  }
  validateStepInvocationInputs(definitions[0]!, invocation.inputs)
  try {
    // Check if step already exists
    const existingStep = await client.testCaseStep.findFirst({
      where: {
        testCaseId: testCaseId,
        order: step.order,
        gherkinStep: `${step.keyword} ${step.text}`,
      },
    })

    if (existingStep) {
      // Update existing step
      await client.testCaseStep.update({
        where: { id: existingStep.id },
        data: {
          gherkinStep: `${step.keyword} ${step.text}`,
          flowNodeId: metadataNode?.nodeId ?? existingStep.flowNodeId,
          label: metadataNode?.label ?? step.text,
          invocationJson: canonicalStepDefinitionJson(invocation),
        },
      })
    } else {
      // Create new step
      await client.testCaseStep.create({
        data: {
          testCaseId: testCaseId,
          order: step.order,
          gherkinStep: `${step.keyword} ${step.text}`,
          flowNodeId: metadataNode?.nodeId,
          icon: determineStepTypeAndIcon(step.keyword).icon,
          label: metadataNode?.label ?? step.text,
          invocationJson: canonicalStepDefinitionJson(invocation),
        },
      })
    }
  } catch (error) {
    console.error(`Error creating/updating test case step:`, error)
    throw error
  }
}

type ParsedScenario = ParsedFeature['scenarios'][number]

const testSuiteInclude = {
  testCases: {
    include: {
      tags: true,
      steps: true,
    },
  },
} as const

type ExistingTestSuite = Prisma.TestSuiteGetPayload<{
  include: typeof testSuiteInclude
}>

async function createScenarioTestCase(
  scenario: ParsedScenario,
  testSuiteId: string,
  client: SyncClient,
): Promise<string | null> {
  const parsedTitle = parseGherkinScenarioTitle(scenario.name, scenario.description)
  const title = scenario.appraiseMetadata?.title ?? parsedTitle.title
  const description = scenario.appraiseMetadata?.description ?? parsedTitle.description
  return findOrCreateTestCase(title, description, testSuiteId, client, scenario.tags)
}

async function createScenarioSteps(testCaseId: string, steps: ParsedStep[], client: SyncClient): Promise<number> {
  for (const step of steps) {
    await createOrUpdateTestCaseStep(testCaseId, step, client)
  }
  return steps.length
}

function applyScenarioMetadataToSteps(scenario: ParsedScenario): ParsedStep[] {
  const nodesByOrder = new Map((scenario.appraiseMetadata?.nodes ?? []).map(node => [node.order, node]))
  return scenario.steps.map(step => ({
    ...step,
    appraiseNode: nodesByOrder.get(step.order),
  }))
}

async function replaceScenarioFlowBlocks(
  testCaseId: string,
  scenario: ParsedScenario,
  client: SyncClient,
): Promise<void> {
  if (!scenario.appraiseMetadata) {
    return
  }

  const validNodeIds = new Set(scenario.appraiseMetadata.nodes.map(node => node.nodeId))

  await client.testCaseFlowBlock.deleteMany({
    where: { testCaseId },
  })

  if (scenario.appraiseMetadata.flowBlocks.length === 0) {
    return
  }

  await client.testCase.update({
    where: { id: testCaseId },
    data: {
      flowBlocks: {
        create: scenario.appraiseMetadata.flowBlocks.map(block => ({
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

async function findExistingTestSuite(
  feature: ParsedFeature,
  moduleId: string,
  client: SyncClient,
): Promise<ExistingTestSuite | null> {
  const suiteIdentifierTag = flattenFeatureTags(feature.tags).find(tag => tag.replace(/^@/, '').startsWith('ts_'))

  if (suiteIdentifierTag) {
    const suiteByTag = await client.testSuite.findFirst({
      where: {
        moduleId,
        tags: {
          some: {
            tagExpression: suiteIdentifierTag,
          },
        },
      },
      include: testSuiteInclude,
    })

    if (suiteByTag) {
      return suiteByTag
    }
  }

  const filesystemKey = getTestSuiteFilesystemKey(extractTestSuiteNameFromFilename(feature.filePath))
  const suitesInModule = await client.testSuite.findMany({
    where: { moduleId },
    include: testSuiteInclude,
  })
  const suiteByFilename = suitesInModule.find(suite => getTestSuiteFilesystemKey(suite.name) === filesystemKey)

  if (suiteByFilename) {
    return suiteByFilename
  }

  return client.testSuite.findFirst({
    where: {
      name: feature.featureName,
      moduleId,
    },
    include: testSuiteInclude,
  })
}

async function connectTagsToTestSuite(testSuiteId: string, client: SyncClient, tags?: string[]): Promise<void> {
  if (!tags || tags.length === 0) {
    return
  }

  const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag, client)))

  await client.testSuite.update({
    where: { id: testSuiteId },
    data: {
      tags: {
        connect: tagIds.map(id => ({ id })),
      },
    },
  })
}

function findExistingScenarioTestCase(
  scenario: ParsedScenario,
  testCases: ExistingTestSuite['testCases'],
): ExistingTestSuite['testCases'][number] | undefined {
  const identifierTag = flattenFeatureTags(scenario.tags).find(tag => tag.replace(/^@/, '').startsWith('tc_'))

  if (identifierTag) {
    return testCases.find(testCase => testCase.tags.some(tag => tag.tagExpression === identifierTag))
  }

  const { title } = parseGherkinScenarioTitle(scenario.name, scenario.description)
  return testCases.find(testCase => testCase.title === title)
}

async function addMissingScenariosToTestSuite(
  feature: ParsedFeature,
  testSuite: ExistingTestSuite,
  client: SyncClient,
): Promise<number> {
  let addedScenarios = 0

  for (const scenario of feature.scenarios) {
    const existingTestCase = findExistingScenarioTestCase(scenario, testSuite.testCases)

    if (existingTestCase) {
      await updateExistingScenarioMetadata(existingTestCase.id, scenario, client)
    } else if (await addScenarioToTestSuite(scenario, testSuite.id, client)) {
      addedScenarios++
    }
  }

  return addedScenarios
}

async function addScenarioToTestSuite(
  scenario: ParsedScenario,
  testSuiteId: string,
  client: SyncClient,
): Promise<boolean> {
  const testCaseId = await createScenarioTestCase(scenario, testSuiteId, client)

  if (!testCaseId) {
    return false
  }

  await createScenarioSteps(testCaseId, applyScenarioMetadataToSteps(scenario), client)
  await replaceScenarioFlowBlocks(testCaseId, scenario, client)
  return true
}

async function updateExistingScenarioMetadata(
  testCaseId: string,
  scenario: ParsedScenario,
  client: SyncClient,
): Promise<void> {
  if (!scenario.appraiseMetadata) {
    return
  }

  await client.testCase.update({
    where: { id: testCaseId },
    data: {
      title: scenario.appraiseMetadata.title,
      description: scenario.appraiseMetadata.description,
    },
  })

  await createScenarioSteps(testCaseId, applyScenarioMetadataToSteps(scenario), client)
  await replaceScenarioFlowBlocks(testCaseId, scenario, client)
}

async function createTestSuiteWithScenarios(
  feature: ParsedFeature,
  moduleId: string,
  client: SyncClient,
): Promise<{
  createdTestSuite: boolean
  addedScenarios: number
}> {
  const testSuiteId = await findOrCreateTestSuite(
    extractTestSuiteNameFromFilename(feature.filePath),
    feature.featureDescription || feature.featureName,
    moduleId,
    client,
    feature.tags,
  )

  if (!testSuiteId) {
    return { createdTestSuite: false, addedScenarios: 0 }
  }

  let addedScenarios = 0

  for (const scenario of feature.scenarios) {
    if (await addScenarioToTestSuite(scenario, testSuiteId, client)) {
      addedScenarios++
    }
  }

  return { createdTestSuite: true, addedScenarios }
}

/**
 * Merges scenarios from feature files with existing test suites
 * This handles conflicts by adding missing scenarios to existing test suites
 */
export async function mergeScenariosWithExistingTestSuites(
  parsedFeatures: ParsedFeature[],
  featuresBaseDir: string,
): Promise<{
  mergedTestSuites: number
  addedScenarios: number
}> {
  let mergedTestSuites = 0
  let addedScenarios = 0

  try {
    for (const feature of parsedFeatures) {
      const result = await mergeFeatureScenarios(feature, featuresBaseDir)

      mergedTestSuites += result.mergedTestSuites
      addedScenarios += result.addedScenarios
    }

    console.log(`Merge completed: ${mergedTestSuites} test suites processed, ${addedScenarios} new scenarios added`)

    return {
      mergedTestSuites,
      addedScenarios,
    }
  } catch (error) {
    console.error('Error merging scenarios with existing test suites:', error)
    throw error
  }
}

export function assertFeatureImportMetadata(feature: ParsedFeature): void {
  if (feature.metadataWarnings.length > 0) {
    throw new Error(`Feature import requires valid Appraise metadata: ${feature.metadataWarnings.join('; ')}`)
  }

  for (const scenario of feature.scenarios) {
    if (scenario.steps.length === 0) continue
    if (!scenario.appraiseMetadata) {
      throw new Error(`Feature import requires Appraise metadata for scenario ${scenario.name}.`)
    }

    const nodesByOrder = new Map(scenario.appraiseMetadata.nodes.map(node => [node.order, node]))
    for (const step of scenario.steps) {
      const node = nodesByOrder.get(step.order)
      if (!node) {
        throw new Error(`Feature import requires Appraise metadata for ${step.keyword} ${step.text}.`)
      }
      stepInvocationSchema.parse(node.invocation)
    }
  }
}

async function mergeFeatureScenarios(
  feature: ParsedFeature,
  featuresBaseDir: string,
): Promise<{
  mergedTestSuites: number
  addedScenarios: number
}> {
  assertFeatureImportMetadata(feature)

  return prisma.$transaction(async client => {
    const moduleId = await buildModuleHierarchy(getFeatureModulePath(feature.filePath, featuresBaseDir), client)
    const existingTestSuite = await findExistingTestSuite(feature, moduleId, client)

    if (existingTestSuite) {
      await connectTagsToTestSuite(existingTestSuite.id, client, feature.tags)

      return {
        mergedTestSuites: 1,
        addedScenarios: await addMissingScenariosToTestSuite(feature, existingTestSuite, client),
      }
    }

    const result = await createTestSuiteWithScenarios(feature, moduleId, client)

    return {
      mergedTestSuites: result.createdTestSuite ? 1 : 0,
      addedScenarios: result.addedScenarios,
    }
  })
}
