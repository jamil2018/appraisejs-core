import { relative } from 'path'
import prisma from '@/config/db-config'
import { ParsedFeature, ParsedStep } from './gherkin-parser'
import { buildModuleHierarchy } from './module-hierarchy-builder'
import { TemplateStepType, TemplateStepIcon, TestCase, TagType } from '@prisma/client'

/**
 * Syncs feature files to the database by creating missing test suites and test cases
 * @param parsedFeatures - Array of parsed feature files
 * @param featuresBaseDir - Base directory for features
 * @returns Promise<{createdTestSuites: number, createdTestCases: number, createdTemplateSteps: number}>
 */
export async function syncFeaturesToDatabase(
  parsedFeatures: ParsedFeature[],
  featuresBaseDir: string,
): Promise<{
  createdTestSuites: number
  createdTestCases: number
  createdTemplateSteps: number
}> {
  let createdTestSuites = 0
  let createdTestCases = 0
  let createdTemplateSteps = 0

  try {
    for (const feature of parsedFeatures) {
      // Extract module path from file path
      const modulePath = extractModulePathFromFilePath(feature.filePath, featuresBaseDir)

      // Build or find the module hierarchy
      const moduleId = await buildModuleHierarchy(modulePath)

      // Find or create test suite
      const testSuiteId = await findOrCreateTestSuite(
        feature.featureName,
        feature.featureDescription,
        moduleId,
        feature.tags,
      )

      if (testSuiteId) {
        createdTestSuites++

        // Process each scenario in the feature
        for (const scenario of feature.scenarios) {
          const testCaseId = await findOrCreateTestCase(
            scenario.name,
            scenario.description || '',
            testSuiteId,
            scenario.tags,
          )

          if (testCaseId) {
            createdTestCases++

            // Process steps for this test case
            for (const step of scenario.steps) {
              const templateStepId = await findOrCreateTemplateStep(step)

              if (templateStepId) {
                createdTemplateSteps++
              }

              // Create or update test case step
              if (testCaseId && templateStepId) {
                await createOrUpdateTestCaseStep(testCaseId, step, templateStepId)
              }
            }
          }
        }
      }
    }

    console.log(
      `Sync completed: ${createdTestSuites} test suites, ${createdTestCases} test cases, ${createdTemplateSteps} template steps created`,
    )

    return {
      createdTestSuites,
      createdTestCases,
      createdTemplateSteps,
    }
  } catch (error) {
    console.error('Error syncing features to database:', error)
    throw error
  }
}

/**
 * Determines the tag type based on the tag expression pattern
 * Pattern: @xx_id_xxxxxxxx where xx is any 2 chars, xxxxxxxx is any chars
 * @param tagExpression - The tag expression (e.g., "@tc_id_ue4qwoml" or "@smoke")
 * @returns TagType - IDENTIFIER if matches pattern, FILTER otherwise
 */
function determineTagType(tagExpression: string): TagType {
  // Pattern: @xx_id_xxxxxxxx where:
  // - @ = literal @
  // - xx = any 2 characters
  // - _id_ = literal string
  // - xxxxxxxx = any characters
  const identifierPattern = /^@.{2}_id_.+$/
  return identifierPattern.test(tagExpression) ? TagType.IDENTIFIER : TagType.FILTER
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
 * Extracts module path from feature file path
 * Works cross-platform (Windows, Mac, Linux)
 */
function extractModulePathFromFilePath(featureFilePath: string, featuresBaseDir: string): string {
  // Use path.relative for cross-platform path handling
  const relativePath = relative(featuresBaseDir, featureFilePath)

  // Normalize to forward slashes for module path format (database uses /)
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(part => part && part !== '')

  // Remove the filename and join the remaining parts
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
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
      const modulePath = extractModulePathFromFilePath(feature.filePath, featuresBaseDir)
      const moduleId = await buildModuleHierarchy(modulePath)

      // Find existing test suite
      const existingTestSuite = await prisma.testSuite.findFirst({
        where: {
          name: feature.featureName,
          moduleId: moduleId,
        },
        include: {
          testCases: true,
        },
      })

      if (existingTestSuite) {
        mergedTestSuites++

        // Associate feature-level tags with existing test suite
        if (feature.tags && feature.tags.length > 0) {
          const tagIds = await Promise.all(feature.tags.map(tag => findOrCreateTag(tag)))
          await prisma.testSuite.update({
            where: { id: existingTestSuite.id },
            data: {
              tags: {
                connect: tagIds.map(id => ({ id })),
              },
            },
          })
        }

        // Check each scenario and add if it doesn't exist
        for (const scenario of feature.scenarios) {
          const existingTestCase = existingTestSuite.testCases.find(tc => tc.title === scenario.name)

          if (!existingTestCase) {
            // Create new test case for this scenario
            const testCaseId = await findOrCreateTestCase(
              scenario.name,
              scenario.description || '',
              existingTestSuite.id,
              scenario.tags,
            )

            if (testCaseId) {
              addedScenarios++

              // Add steps for this test case
              for (const step of scenario.steps) {
                const templateStepId = await findOrCreateTemplateStep(step)
                if (templateStepId && testCaseId) {
                  await createOrUpdateTestCaseStep(testCaseId, step, templateStepId)
                }
              }
            }
          }
        }
      } else {
        // Create new test suite with all scenarios
        const testSuiteId = await findOrCreateTestSuite(
          feature.featureName,
          feature.featureDescription,
          moduleId,
          feature.tags,
        )

        if (testSuiteId) {
          mergedTestSuites++

          for (const scenario of feature.scenarios) {
            const testCaseId = await findOrCreateTestCase(
              scenario.name,
              scenario.description || '',
              testSuiteId,
              scenario.tags,
            )

            if (testCaseId) {
              addedScenarios++

              for (const step of scenario.steps) {
                const templateStepId = await findOrCreateTemplateStep(step)
                if (templateStepId && testCaseId) {
                  await createOrUpdateTestCaseStep(testCaseId, step, templateStepId)
                }
              }
            }
          }
        }
      }
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
