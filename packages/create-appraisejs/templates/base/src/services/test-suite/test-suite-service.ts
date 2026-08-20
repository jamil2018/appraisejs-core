import prisma from '@/config/db-config'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { getOrCreateTestSuiteIdentifierTagId } from '@/lib/test-suite-identifier-service'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { ServiceError } from '@/services/shared/errors'
import { TagType } from '@prisma/client'
import { z } from 'zod'

export async function listTestSuites(targetProjectId: string) {
  await ensureTestSuiteIdentifierTags(undefined, targetProjectId)

  return prisma.testSuite.findMany({
    where: { targetProjectId },
    include: {
      module: true,
      testCases: true,
      tags: true,
    },
  })
}

export async function createTestSuiteFromInput(value: z.infer<typeof testSuiteSchema>, targetProjectId: string) {
  const [module, testCases, tags] = await Promise.all([
    prisma.module.findFirst({ where: { id: value.moduleId, targetProjectId }, select: { id: true } }),
    prisma.testCase.findMany({ where: { id: { in: value.testCases ?? [] }, targetProjectId }, select: { id: true } }),
    prisma.tag.findMany({ where: { id: { in: value.tagIds ?? [] }, targetProjectId }, select: { id: true } }),
  ])
  if (!module || testCases.length !== (value.testCases ?? []).length || tags.length !== (value.tagIds ?? []).length)
    throw new ServiceError('Test suite relationships must belong to the active project', 'VALIDATION', 400)
  const suiteIdentifier = generateUniqueTestSuiteIdentifier()
  const newTestSuite = await prisma.$transaction(async tx => {
    const suiteIdentifierTag = await tx.tag.create({
      data: {
        name: suiteIdentifier,
        type: TagType.IDENTIFIER,
        tagExpression: `@${suiteIdentifier}`,
        targetProject: { connect: { id: targetProjectId } },
      },
    })

    return tx.testSuite.create({
      data: {
        name: value.name,
        description: value.description,
        targetProject: { connect: { id: targetProjectId } },
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

  return newTestSuite
}

export async function getTestSuiteByIdOrThrow(id: string, targetProjectId: string) {
  await ensureTestSuiteIdentifierTags([id], targetProjectId)

  const testSuite = await prisma.testSuite.findFirst({
    where: { id, targetProjectId },
    include: {
      module: true,
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

export async function deleteTestSuitesByIds(ids: string[], targetProjectId: string): Promise<void> {
  const suiteIdentifierTags = await prisma.tag.findMany({
    where: {
      type: TagType.IDENTIFIER,
      targetProjectId,
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

  await prisma.testSuite.deleteMany({
    where: { id: { in: ids }, targetProjectId },
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

export async function updateTestSuiteFromInput(
  value: z.infer<typeof testSuiteSchema>,
  id: string,
  targetProjectId: string,
): Promise<void> {
  const currentTestSuite = await prisma.testSuite.findFirst({
    where: { id, targetProjectId },
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
  const [module, testCases, tags] = await Promise.all([
    prisma.module.findFirst({ where: { id: value.moduleId, targetProjectId }, select: { id: true } }),
    prisma.testCase.findMany({ where: { id: { in: value.testCases ?? [] }, targetProjectId }, select: { id: true } }),
    prisma.tag.findMany({ where: { id: { in: value.tagIds ?? [] }, targetProjectId }, select: { id: true } }),
  ])
  if (!module || testCases.length !== (value.testCases ?? []).length || tags.length !== (value.tagIds ?? []).length)
    throw new ServiceError('Test suite relationships must belong to the active project', 'VALIDATION', 400)

  const suiteIdentifierTagId = await getOrCreateTestSuiteIdentifierTagId(id, targetProjectId)
  await prisma.testSuite.update({
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
}
