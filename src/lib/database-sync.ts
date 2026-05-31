import prisma from '@/config/db-config'
import { ParsedFeature, ParsedStep } from './gherkin-parser'
import { buildModuleHierarchy } from './module-hierarchy-builder'
import { Prisma, TemplateStepType, TemplateStepIcon, TestCase, TagType } from '@prisma/client'
import { getTagTypeFromExpression } from './tag-identifiers'
import { getFeatureModulePath } from './path-helpers/feature-path'
import { getTestSuiteFilesystemKey } from './sync/projected-feature-utils'

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

function parseScenarioTitle(
  scenarioName: string,
  scenarioDescription?: string,
): { title: string; description: string } {
  if (scenarioDescription) {
    return {
      title: scenarioDescription.trim(),
      description: scenarioName.trim(),
    }
  }

  return {
    title: scenarioName.trim(),
    description: '',
  }
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
async function findOrCreateTag(tagExpression: string): Promise<string> {
  try {
    // Find existing tag by tagExpression
    const existingTag = await prisma.tag.findFirst({
      where: {
        tagExpression: tagExpression,
      },
    })

    const expectedType = determineTagType(tagExpression)
    const tagName = deriveTagName(tagExpression)

    if (existingTag) {
      // Update type if it differs from expected type
      if (existingTag.type !== expectedType) {
        await prisma.tag.update({
          where: { id: existingTag.id },
          data: { type: expectedType },
        })
        console.log(`Updated tag type for ${tagExpression} from ${existingTag.type} to ${expectedType}`)
      }
      return existingTag.id
    }

    // Create new tag
    const newTag = await prisma.tag.create({
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
  tags?: string[],
): Promise<string | null> {
  try {
    // Try to find existing test suite
    const existingTestSuite = await prisma.testSuite.findFirst({
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
        const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag)))
        await prisma.testSuite.update({
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
    const tagIds = tags && tags.length > 0 ? await Promise.all(tags.map(tag => findOrCreateTag(tag))) : []

    const newTestSuite = await prisma.testSuite.create({
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
  tags?: string[],
): Promise<string | null> {
  try {
    // Try to find existing test case
    const existingTestCase: TestCase | null = await prisma.testCase.findFirst({
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
        const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag)))
        await prisma.testCase.update({
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
    const tagIds = tags && tags.length > 0 ? await Promise.all(tags.map(tag => findOrCreateTag(tag))) : []

    const newTestCase = await prisma.testCase.create({
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
 * Finds or creates a template step
 */
async function findOrCreateTemplateStep(step: ParsedStep): Promise<string | null> {
  try {
    // Try to find existing template step by signature
    const signature = `${step.keyword} ${step.text}`
    const existingTemplateStep = await prisma.templateStep.findFirst({
      where: {
        signature: signature,
      },
    })

    if (existingTemplateStep) {
      return existingTemplateStep.id
    }

    // Create a default template step group if none exists
    let templateStepGroup = await prisma.templateStepGroup.findFirst()
    if (!templateStepGroup) {
      templateStepGroup = await prisma.templateStepGroup.create({
        data: {
          name: 'Default Steps',
          description: 'Auto-generated template step group for feature file steps',
        },
      })
    }

    // Determine step type and icon based on keyword
    const { type, icon } = determineStepTypeAndIcon(step.keyword)

    // Create new template step
    const newTemplateStep = await prisma.templateStep.create({
      data: {
        name: step.text.substring(0, 50) + (step.text.length > 50 ? '...' : ''),
        description: `Auto-generated step: ${step.text}`,
        signature: signature,
        type: type,
        icon: icon,
        templateStepGroupId: templateStepGroup.id,
      },
    })

    console.log(`Created template step: ${signature}`)
    return newTemplateStep.id
  } catch (error) {
    console.error(`Error creating template step for ${step.keyword} ${step.text}:`, error)
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
 * Creates or updates a test case step
 */
async function createOrUpdateTestCaseStep(testCaseId: string, step: ParsedStep, templateStepId: string): Promise<void> {
  try {
    // Check if step already exists
    const existingStep = await prisma.testCaseStep.findFirst({
      where: {
        testCaseId: testCaseId,
        order: step.order,
        gherkinStep: `${step.keyword} ${step.text}`,
      },
    })

    if (existingStep) {
      // Update existing step
      await prisma.testCaseStep.update({
        where: { id: existingStep.id },
        data: {
          gherkinStep: `${step.keyword} ${step.text}`,
          label: step.text,
          templateStepId: templateStepId,
        },
      })
    } else {
      // Create new step
      await prisma.testCaseStep.create({
        data: {
          testCaseId: testCaseId,
          order: step.order,
          gherkinStep: `${step.keyword} ${step.text}`,
          icon: determineStepTypeAndIcon(step.keyword).icon,
          label: step.text,
          templateStepId: templateStepId,
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
    },
  },
} as const

type ExistingTestSuite = Prisma.TestSuiteGetPayload<{
  include: typeof testSuiteInclude
}>

async function createScenarioTestCase(scenario: ParsedScenario, testSuiteId: string): Promise<string | null> {
  const { title, description } = parseScenarioTitle(scenario.name, scenario.description)
  return findOrCreateTestCase(title, description, testSuiteId, scenario.tags)
}

async function createScenarioSteps(testCaseId: string, steps: ParsedStep[]): Promise<number> {
  let createdTemplateSteps = 0

  for (const step of steps) {
    const templateStepId = await findOrCreateTemplateStep(step)

    if (templateStepId) {
      createdTemplateSteps++
      await createOrUpdateTestCaseStep(testCaseId, step, templateStepId)
    }
  }

  return createdTemplateSteps
}

async function findExistingTestSuite(feature: ParsedFeature, moduleId: string): Promise<ExistingTestSuite | null> {
  const suiteIdentifierTag = flattenFeatureTags(feature.tags).find(tag => tag.replace(/^@/, '').startsWith('ts_'))

  if (suiteIdentifierTag) {
    const suiteByTag = await prisma.testSuite.findFirst({
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
  const suitesInModule = await prisma.testSuite.findMany({
    where: { moduleId },
    include: testSuiteInclude,
  })
  const suiteByFilename = suitesInModule.find(suite => getTestSuiteFilesystemKey(suite.name) === filesystemKey)

  if (suiteByFilename) {
    return suiteByFilename
  }

  return prisma.testSuite.findFirst({
    where: {
      name: feature.featureName,
      moduleId,
    },
    include: testSuiteInclude,
  })
}

async function connectTagsToTestSuite(testSuiteId: string, tags?: string[]): Promise<void> {
  if (!tags || tags.length === 0) {
    return
  }

  const tagIds = await Promise.all(tags.map(tag => findOrCreateTag(tag)))

  await prisma.testSuite.update({
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

  const { title } = parseScenarioTitle(scenario.name, scenario.description)
  return testCases.find(testCase => testCase.title === title)
}

async function addMissingScenariosToTestSuite(feature: ParsedFeature, testSuite: ExistingTestSuite): Promise<number> {
  let addedScenarios = 0

  for (const scenario of feature.scenarios) {
    const existingTestCase = findExistingScenarioTestCase(scenario, testSuite.testCases)

    if (!existingTestCase && (await addScenarioToTestSuite(scenario, testSuite.id))) {
      addedScenarios++
    }
  }

  return addedScenarios
}

async function addScenarioToTestSuite(scenario: ParsedScenario, testSuiteId: string): Promise<boolean> {
  const testCaseId = await createScenarioTestCase(scenario, testSuiteId)

  if (!testCaseId) {
    return false
  }

  await createScenarioSteps(testCaseId, scenario.steps)
  return true
}

async function createTestSuiteWithScenarios(
  feature: ParsedFeature,
  moduleId: string,
): Promise<{
  createdTestSuite: boolean
  addedScenarios: number
}> {
  const testSuiteId = await findOrCreateTestSuite(
    extractTestSuiteNameFromFilename(feature.filePath),
    feature.featureDescription || feature.featureName,
    moduleId,
    feature.tags,
  )

  if (!testSuiteId) {
    return { createdTestSuite: false, addedScenarios: 0 }
  }

  let addedScenarios = 0

  for (const scenario of feature.scenarios) {
    if (await addScenarioToTestSuite(scenario, testSuiteId)) {
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

async function mergeFeatureScenarios(
  feature: ParsedFeature,
  featuresBaseDir: string,
): Promise<{
  mergedTestSuites: number
  addedScenarios: number
}> {
  const moduleId = await buildModuleHierarchy(getFeatureModulePath(feature.filePath, featuresBaseDir))
  const existingTestSuite = await findExistingTestSuite(feature, moduleId)

  if (existingTestSuite) {
    await connectTagsToTestSuite(existingTestSuite.id, feature.tags)

    return {
      mergedTestSuites: 1,
      addedScenarios: await addMissingScenariosToTestSuite(feature, existingTestSuite),
    }
  }

  const result = await createTestSuiteWithScenarios(feature, moduleId)

  return {
    mergedTestSuites: result.createdTestSuite ? 1 : 0,
    addedScenarios: result.addedScenarios,
  }
}
