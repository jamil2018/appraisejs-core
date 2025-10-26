import prisma from '@/config/db-config'
import { ParsedFeature, ParsedStep } from './gherkin-parser'
import { buildModuleHierarchy } from './module-hierarchy-builder'
import { TemplateStepType, TemplateStepIcon, TestCase } from '@prisma/client'

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
      const testSuiteId = await findOrCreateTestSuite(feature.featureName, feature.featureDescription, moduleId)

      if (testSuiteId) {
        createdTestSuites++

        // Process each scenario in the feature
        for (const scenario of feature.scenarios) {
          const testCaseId = await findOrCreateTestCase(scenario.name, scenario.description || '', testSuiteId)

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
 * Extracts module path from feature file path
 */
function extractModulePathFromFilePath(featureFilePath: string, featuresBaseDir: string): string {
  const relativePath = featureFilePath.replace(featuresBaseDir, '')
  const pathParts = relativePath.split('/').filter(part => part && part !== '')

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
): Promise<string | null> {
  try {
    // Try to find existing test suite
    const existingTestSuite = await prisma.testSuite.findFirst({
      where: {
        name: name,
        moduleId: moduleId,
      },
    })

    if (existingTestSuite) {
      return existingTestSuite.id
    }

    // Create new test suite
    const newTestSuite = await prisma.testSuite.create({
      data: {
        name: name,
        description: description || null,
        moduleId: moduleId,
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
async function findOrCreateTestCase(title: string, description: string, testSuiteId: string): Promise<string | null> {
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
    })

    if (existingTestCase) {
      return existingTestCase.id
    }

    // Create new test case
    const newTestCase = await prisma.testCase.create({
      data: {
        title: title,
        description: description,
        TestSuite: {
          connect: {
            id: testSuiteId,
          },
        },
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

        // Check each scenario and add if it doesn't exist
        for (const scenario of feature.scenarios) {
          const existingTestCase = existingTestSuite.testCases.find(tc => tc.title === scenario.name)

          if (!existingTestCase) {
            // Create new test case for this scenario
            const testCaseId = await findOrCreateTestCase(
              scenario.name,
              scenario.description || '',
              existingTestSuite.id,
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
        const testSuiteId = await findOrCreateTestSuite(feature.featureName, feature.featureDescription, moduleId)

        if (testSuiteId) {
          mergedTestSuites++

          for (const scenario of feature.scenarios) {
            const testCaseId = await findOrCreateTestCase(scenario.name, scenario.description || '', testSuiteId)

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
