import prisma from '@/config/db-config'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { generateUniqueTestCaseIdentifier } from '@/lib/test-case-utils'
import { z } from 'zod'
import { StepParameterType, TagType } from '@prisma/client'
import { ServiceError } from '@/services/shared/errors'

export async function deleteTestCasesByIds(ids: string[]): Promise<void> {
  const affectedTestSuites = await prisma.testSuite.findMany({
    where: {
      testCases: {
        some: {
          id: {
            in: ids,
          },
        },
      },
    },
    select: { id: true },
  })

  const testCaseIdentifierTags = await prisma.tag.findMany({
    where: {
      type: TagType.IDENTIFIER,
      testCases: {
        some: {
          id: {
            in: ids,
          },
        },
      },
    },
    select: {
      id: true,
    },
  })

  await prisma.$transaction(async tx => {
    await tx.testRunTestCase.deleteMany({
      where: {
        testCaseId: {
          in: ids,
        },
      },
    })

    await tx.review.deleteMany({
      where: {
        testCaseId: {
          in: ids,
        },
      },
    })

    await tx.linkedJiraTicket.deleteMany({
      where: {
        testCaseId: {
          in: ids,
        },
      },
    })

    await tx.testCaseStepParameter.deleteMany({
      where: {
        testCaseStep: {
          testCaseId: {
            in: ids,
          },
        },
      },
    })

    await tx.testCaseStep.deleteMany({
      where: {
        testCaseId: {
          in: ids,
        },
      },
    })

    await tx.tag.deleteMany({
      where: {
        id: { in: testCaseIdentifierTags.map(tag => tag.id) },
      },
    })

    await tx.testCase.deleteMany({
      where: { id: { in: ids } },
    })
  })

  await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))
}

export async function listTestCases() {
  return prisma.testCase.findMany({
    include: {
      steps: {
        include: {
          parameters: true,
        },
      },
      TestSuite: true,
      tags: true,
    },
  })
}

export async function createTestCaseFromInput(value: z.infer<typeof testCaseSchema>) {
  const uniqueTestCaseIdentifier = generateUniqueTestCaseIdentifier()
  const testCaseIdentifierTag = await prisma.tag.create({
    data: {
      name: uniqueTestCaseIdentifier,
      type: TagType.IDENTIFIER,
      tagExpression: `@${uniqueTestCaseIdentifier}`,
    },
  })

  const baseData = {
    title: value.title,
    description: value.description ?? '',
    TestSuite: {
      connect: value.testSuiteIds.map(id => ({ id })),
    },
    steps: {
      create: value.steps.map(step => ({
        gherkinStep: step.gherkinStep,
        label: step.label,
        icon: step.icon,
        parameters: {
          create: step.parameters.map(param => ({
            name: param.name,
            value: param.value,
            type: param.type as StepParameterType,
            order: param.order,
          })),
        },
        templateStepId: step.templateStepId,
        order: step.order,
      })),
    },
  }

  const data =
    value.tagIds && value.tagIds.length > 0
      ? {
          ...baseData,
          tags: {
            connect: [{ id: testCaseIdentifierTag.id }, ...value.tagIds.map(id => ({ id }))],
          },
        }
      : {
          ...baseData,
          tags: {
            connect: [{ id: testCaseIdentifierTag.id }],
          },
        }

  const newTestCase = await prisma.testCase.create({
    data,
    include: {
      TestSuite: {
        select: {
          id: true,
        },
      },
    },
  })

  await Promise.all(newTestCase.TestSuite.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

  return newTestCase
}

export async function getTestCaseByIdOrThrow(id: string) {
  const testCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      steps: {
        include: {
          parameters: true,
        },
      },
      TestSuite: {
        select: {
          id: true,
        },
      },
      tags: {
        select: {
          id: true,
        },
        where: {
          type: TagType.FILTER,
        },
      },
    },
  })

  if (!testCase) {
    throw new ServiceError('Test case not found', 'NOT_FOUND', 404)
  }

  return {
    ...testCase,
    testSuiteIds: testCase.TestSuite.map(suite => suite.id),
    tagIds: testCase.tags.map(tag => tag.id),
  }
}

export async function updateTestCaseFromInput(value: z.infer<typeof testCaseSchema>, id: string) {
  const affectedTestSuites = await prisma.testSuite.findMany({
    where: {
      testCases: {
        some: {
          id,
        },
      },
    },
    select: {
      id: true,
    },
  })

  const steps = await prisma.testCaseStep.findMany({
    where: { testCaseId: id },
    select: { id: true },
  })
  const stepIds = steps.map(step => step.id)

  if (stepIds.length > 0) {
    await prisma.testCaseStepParameter.deleteMany({
      where: { testCaseStepId: { in: stepIds } },
    })
  }

  await prisma.testCaseStep.deleteMany({
    where: { testCaseId: id },
  })

  const existingTestCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      tags: {
        where: {
          type: TagType.IDENTIFIER,
        },
        select: {
          id: true,
        },
      },
    },
  })

  if (!existingTestCase) {
    throw new ServiceError('Test case not found', 'NOT_FOUND', 404)
  }

  const identifierTagIds = existingTestCase.tags.map(tag => tag.id)
  const filterTagIds = value.tagIds || []
  const allTagIds = [...identifierTagIds, ...filterTagIds]

  const testCase = await prisma.testCase.update({
    where: { id },
    data: {
      title: value.title,
      description: value.description ?? '',
      tags: {
        set: allTagIds.map(tagId => ({ id: tagId })),
      },
      steps: {
        create: value.steps.map(step => ({
          gherkinStep: step.gherkinStep,
          label: step.label ?? '',
          icon: step.icon ?? '',
          parameters: {
            create: step.parameters.map(param => ({
              name: param.name,
              value: param.value,
              type: param.type as StepParameterType,
              order: param.order,
            })),
          },
          templateStepId: step.templateStepId,
          order: step.order,
        })),
      },
    },
    include: {
      steps: true,
    },
  })

  await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

  return testCase
}
