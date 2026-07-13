import prisma from '@/config/db-config'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { getIdentifierTagByPrefix } from '@/lib/tag-filters'
import { TagType } from '@prisma/client'

async function createTestSuiteIdentifierTag(targetProjectId: string) {
  const identifier = generateUniqueTestSuiteIdentifier()

  return prisma.tag.create({
    data: {
      name: identifier,
      type: TagType.IDENTIFIER,
      tagExpression: `@${identifier}`,
      targetProjectId,
    },
  })
}

export async function ensureTestSuiteIdentifierTags(
  testSuiteIds: string[] | undefined,
  targetProjectId: string,
): Promise<void> {
  const testSuites = await prisma.testSuite.findMany({
    where: { targetProjectId, ...(testSuiteIds ? { id: { in: testSuiteIds } } : {}) },
    include: {
      tags: {
        select: {
          id: true,
          name: true,
          tagExpression: true,
          type: true,
        },
      },
    },
  })

  for (const testSuite of testSuites) {
    const suiteIdentifierTag = getIdentifierTagByPrefix(testSuite.tags, 'ts_')
    if (suiteIdentifierTag) {
      continue
    }

    const identifierTag = await createTestSuiteIdentifierTag(targetProjectId)
    await prisma.testSuite.update({
      where: { id: testSuite.id },
      data: {
        tags: {
          connect: {
            id: identifierTag.id,
          },
        },
      },
    })
  }
}

export async function getOrCreateTestSuiteIdentifierTagId(
  testSuiteId: string,
  targetProjectId: string,
): Promise<string> {
  await ensureTestSuiteIdentifierTags([testSuiteId], targetProjectId)

  const testSuite = await prisma.testSuite.findFirst({
    where: { id: testSuiteId, targetProjectId },
    include: {
      tags: {
        select: {
          id: true,
          name: true,
          tagExpression: true,
          type: true,
        },
      },
    },
  })

  const identifierTag = testSuite ? getIdentifierTagByPrefix(testSuite.tags, 'ts_') : undefined
  if (!identifierTag) {
    throw new Error(`Unable to resolve identifier tag for test suite ${testSuiteId}`)
  }

  return identifierTag.id
}
