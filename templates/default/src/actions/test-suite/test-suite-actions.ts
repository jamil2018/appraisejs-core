// action.ts
'use server'

import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import {
  ensureTestSuiteIdentifierTags,
  getOrCreateTestSuiteIdentifierTagId,
} from '@/lib/test-suite-identifier-service'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { ActionResponse } from '@/types/form/actionHandler'
import { Prisma, TagType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'

export async function getAllTestSuitesAction(): Promise<ActionResponse> {
  try {
    await ensureTestSuiteIdentifierTags()

    const testSuites = await prisma.testSuite.findMany({
      include: {
        module: true,
        testCases: true,
        tags: true,
      },
    })
    return {
      status: 200,
      data: testSuites,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)

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

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite created successfully',
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: 400,
        error: error.message,
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 500,
        error: error.message,
      }
    }
    return {
      status: 500,
      error: 'Server error occurred',
    }
  }
}

export async function deleteTestSuiteAction(id: string[]): Promise<ActionResponse> {
  try {
    const suiteIdentifierTags = await prisma.tag.findMany({
      where: {
        type: TagType.IDENTIFIER,
        name: {
          startsWith: 'ts_',
        },
        testSuites: {
          some: {
            id: {
              in: id,
            },
          },
        },
      },
      select: {
        id: true,
      },
    })

    for (const testSuiteId of id) {
      try {
        await automationProjectionService.deleteFeature(testSuiteId)
      } catch (error) {
        console.error(`Error deleting feature file for test suite ${testSuiteId}:`, error)
      }
    }

    await prisma.testSuite.deleteMany({
      where: { id: { in: id } },
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

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite(s) deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getTestSuiteByIdAction(id: string): Promise<ActionResponse> {
  try {
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
    return {
      status: 200,
      data: testSuite,
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function updateTestSuiteAction(
  _prev: unknown,
  value: z.infer<typeof testSuiteSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    testSuiteSchema.parse(value)
    await ensureTestSuiteIdentifierTags(id ? [id] : undefined)

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
      return {
        status: 404,
        error: 'Test suite not found',
      }
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

    const suiteIdentifierTagId = id ? await getOrCreateTestSuiteIdentifierTagId(id) : undefined
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

    revalidatePath('/test-suites')
    return {
      status: 200,
      message: 'Test suite updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
