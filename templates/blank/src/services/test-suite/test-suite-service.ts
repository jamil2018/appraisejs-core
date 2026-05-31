import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { getOrCreateTestSuiteIdentifierTagId } from '@/lib/test-suite-identifier-service'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { ServiceError } from '@/services/shared/errors'
import { TagType } from '@prisma/client'
import { z } from 'zod'

export async function listTestSuites() {
  await ensureTestSuiteIdentifierTags()

  return prisma.testSuite.findMany({
    include: {
      module: true,
      testCases: true,
      tags: true,
    },
  })
}

export async function createTestSuiteFromInput(value: z.infer<typeof testSuiteSchema>) {
  const suiteIdentifier = generateUniqueTestSuiteIdentifier()
  const newTestSuite = await prisma.$transaction(async tx => {
    const suiteIdentifierTag = await tx.tag.create({
      data: {
        name: suiteIdentifier,
        type: TagType.IDENTIFIER,
        tagExpression: `@${suiteIdentifier}`,
      },
    })

    return tx.testSuite.create({
      data: {
        name: value.name,
        description: value.description,
        module: {
          connect: {
            id: value.moduleId,
          },
        },
        testCases: {
          connect: value.testCases?.map(id => ({ id })),
        },
        tags: {
          connect: [{ id: suiteIdentifierTag.id }, ...(value.tagIds?.map(id => ({ id })) || [])],
        },
      },
    })
  })

  try {
    await automationProjectionService.generateFeature(newTestSuite.id)
  } catch (error) {
    console.error('Error generating feature file:', error)
  }

  return newTestSuite
}

export async function getTestSuiteByIdOrThrow(id: string) {
  await ensureTestSuiteIdentifierTags([id])

  const testSuite = await prisma.testSuite.findUnique({
    where: { id },
    include: {
      testCases: true,
      tags: {
        where: {
          type: TagType.FILTER,
        },
      },
    },
  })

  if (!testSuite) {
    throw new ServiceError('Test suite not found', 'NOT_FOUND', 404)
  }

  return testSuite
}

export async function deleteTestSuitesByIds(ids: string[]): Promise<void> {
  const suiteIdentifierTags = await prisma.tag.findMany({
    where: {
      type: TagType.IDENTIFIER,
      name: {
        startsWith: 'ts_',
      },
      testSuites: {
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

  for (const testSuiteId of ids) {
    try {
      await automationProjectionService.deleteFeature(testSuiteId)
    } catch (error) {
      console.error(`Error deleting feature file for test suite ${testSuiteId}:`, error)
    }
  }

  await prisma.testSuite.deleteMany({
    where: { id: { in: ids } },
  })

  if (suiteIdentifierTags.length > 0) {
    await prisma.tag.deleteMany({
      where: {
        id: {
          in: suiteIdentifierTags.map(tag => tag.id),
        },
        testSuites: {
          none: {},
        },
        testCases: {
          none: {},
        },
        testRuns: {
          none: {},
        },
      },
    })
  }
}

export async function updateTestSuiteFromInput(value: z.infer<typeof testSuiteSchema>, id: string): Promise<void> {
  const currentTestSuite = await prisma.testSuite.findUnique({
    where: { id },
    include: {
      module: true,
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

  if (!currentTestSuite) {
    throw new ServiceError('Test suite not found', 'NOT_FOUND', 404)
  }

  const nameChanged = currentTestSuite.name !== value.name
  const moduleChanged = currentTestSuite.moduleId !== value.moduleId

  if (nameChanged || moduleChanged) {
    try {
      await automationProjectionService.deleteFeature(currentTestSuite.id)
    } catch (error) {
      console.error('Error deleting old feature file:', error)
    }
  }

  const suiteIdentifierTagId = await getOrCreateTestSuiteIdentifierTagId(id)
  const updatedTestSuite = await prisma.testSuite.update({
    where: { id },
    data: {
      name: value.name,
      description: value.description,
      testCases: {
        set: value.testCases?.map(testCaseId => ({ id: testCaseId })),
      },
      tags: {
        set: [suiteIdentifierTagId, ...(value.tagIds || [])]
          .filter((tagId): tagId is string => Boolean(tagId))
          .map(tagId => ({ id: tagId })),
      },
      module: {
        connect: {
          id: value.moduleId,
        },
      },
    },
  })

  try {
    await automationProjectionService.generateFeature(updatedTestSuite.id)
  } catch (error) {
    console.error('Error generating updated feature file:', error)
  }
}
