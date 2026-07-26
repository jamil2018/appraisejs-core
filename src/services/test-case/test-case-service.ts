import prisma from '@/config/db-config'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { generateUniqueTestCaseIdentifier } from '@/lib/test-case-utils'
import { z } from 'zod'
import { TagType } from '@prisma/client'
import { ServiceError } from '@/services/shared/errors'
import { flowBlockCreates, testCaseStepCreates } from '@/services/shared/authored-step-persistence'
import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'

export async function deleteTestCasesByIds(ids: string[], targetProjectId: string): Promise<void> {
  const affectedTestSuites = await prisma.testSuite.findMany({
    where: {
      targetProjectId,
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
      targetProjectId,
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
      where: { id: { in: ids }, targetProjectId },
    })
  })

  await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))
}

export async function listTestCases(targetProjectId: string) {
  return prisma.testCase.findMany({
    where: { targetProjectId },
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

type TestCaseInput = z.input<typeof testCaseSchema>

async function validateTestCaseRelationships(value: TestCaseInput, targetProjectId: string) {
  const [suites, tags, definitions] = await Promise.all([
    prisma.testSuite.findMany({ where: { id: { in: value.testSuiteIds }, targetProjectId }, select: { id: true } }),
    prisma.tag.findMany({ where: { id: { in: value.tagIds ?? [] }, targetProjectId }, select: { id: true } }),
    resolveReadyExactStepDefinitions(value.steps),
  ])
  if (suites.length !== value.testSuiteIds.length || tags.length !== (value.tagIds ?? []).length || !definitions)
    throw new ServiceError(
      'Test case project relationships are invalid or a referenced Step Definition is not ready and exact',
      'VALIDATION',
      400,
    )
  return definitions
}

function prepareTestCaseWrites(
  value: TestCaseInput,
  definitions: Awaited<ReturnType<typeof validateTestCaseRelationships>>,
) {
  return {
    steps: testCaseStepCreates(value.steps, definitions),
    flowBlocks: flowBlockCreates(value.flowBlocks),
  }
}

export async function createTestCaseFromInput(value: TestCaseInput, targetProjectId: string) {
  const definitions = await validateTestCaseRelationships(value, targetProjectId)
  const prepared = prepareTestCaseWrites(value, definitions)
  const uniqueTestCaseIdentifier = generateUniqueTestCaseIdentifier()

  const newTestCase = await prisma.$transaction(async tx => {
    const testCaseIdentifierTag = await tx.tag.create({
      data: {
        name: uniqueTestCaseIdentifier,
        type: TagType.IDENTIFIER,
        tagExpression: `@${uniqueTestCaseIdentifier}`,
        targetProjectId,
      },
    })

    return tx.testCase.create({
      data: {
        title: value.title,
        description: value.description ?? '',
        targetProjectId,
        TestSuite: { connect: value.testSuiteIds.map(id => ({ id })) },
        tags: {
          connect: [{ id: testCaseIdentifierTag.id }, ...(value.tagIds ?? []).map(id => ({ id }))],
        },
        steps: { create: prepared.steps },
        flowBlocks: { create: prepared.flowBlocks },
      },
      include: { TestSuite: { select: { id: true } } },
    })
  })

  await Promise.all(newTestCase.TestSuite.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

  return newTestCase
}

export async function getTestCaseByIdOrThrow(id: string, targetProjectId: string) {
  const testCase = await prisma.testCase.findFirst({
    where: { id, targetProjectId },
    include: {
      steps: {
        include: {
          parameters: true,
        },
      },
      flowBlocks: {
        include: {
          nodes: true,
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

export async function updateTestCaseFromInput(value: TestCaseInput, id: string, targetProjectId: string) {
  await getTestCaseByIdOrThrow(id, targetProjectId)
  const definitions = await validateTestCaseRelationships(value, targetProjectId)
  const prepared = prepareTestCaseWrites(value, definitions)
  const affectedTestSuites = await prisma.testSuite.findMany({
    where: {
      targetProjectId,
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

  const existingTestCase = await prisma.testCase.findFirst({
    where: { id, targetProjectId },
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

  const testCase = await prisma.$transaction(async tx => {
    if (stepIds.length > 0) {
      await tx.testCaseStepParameter.deleteMany({ where: { testCaseStepId: { in: stepIds } } })
    }
    await tx.testCaseStep.deleteMany({ where: { testCaseId: id } })
    await tx.testCaseFlowBlock.deleteMany({ where: { testCaseId: id } })

    return tx.testCase.update({
      where: { id },
      data: {
        title: value.title,
        description: value.description ?? '',
        tags: { set: allTagIds.map(tagId => ({ id: tagId })) },
        steps: { create: prepared.steps },
        flowBlocks: { create: prepared.flowBlocks },
      },
      include: { steps: true },
    })
  })

  await Promise.all(affectedTestSuites.map(testSuite => automationProjectionService.generateFeature(testSuite.id)))

  return testCase
}
