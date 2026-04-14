import prisma from '@/config/db-config'
import { generateUniqueTestSuiteIdentifier } from '@/lib/test-suite-utils'
import { getIdentifierTagByPrefix } from '@/lib/tag-utils'
import { TagType } from '@prisma/client'

async function createTestSuiteIdentifierTag() {
  const identifier = generateUniqueTestSuiteIdentifier()

  return prisma.tag.create({
    data: {
      name: identifier,
      type: TagType.IDENTIFIER,
      tagExpression: `@${identifier}`,
    },
  })
}

export async function ensureTestSuiteIdentifierTags(testSuiteIds?: string[]): Promise<void> {
  const testSuites = await prisma.testSuite.findMany({
    where: testSuiteIds ? { id: { in: testSuiteIds } } : undefined,
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

    const identifierTag = await createTestSuiteIdentifierTag()
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

export async function getOrCreateTestSuiteIdentifierTagId(testSuiteId: string): Promise<string> {
  await ensureTestSuiteIdentifierTags([testSuiteId])

  const testSuite = await prisma.testSuite.findUnique({
    where: { id: testSuiteId },
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
