import { TagType, TestRunTestCaseStatus } from '@prisma/client'
import { getIdentifierTagByPrefix } from '@/lib/tag-utils'

type TagLike = {
  name: string
  tagExpression: string
  type: TagType
}

type MatchableRunTestCase = {
  id: string
  status: TestRunTestCaseStatus
  testSuiteId: string | null
  testCase: {
    id: string
    title: string
    tags: TagLike[]
  }
  testSuite?: {
    id: string
    name: string
    tags: TagLike[]
  } | null
}

type ScenarioMatchInput = {
  scenarioName: string
  scenarioTags?: string[]
}

function normalizeTagExpression(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression : `@${tagExpression}`
}

function consumeCandidate<T extends MatchableRunTestCase>(candidates: T[]): T | undefined {
  const unconsumed = candidates.find(
    candidate =>
      candidate.status !== TestRunTestCaseStatus.COMPLETED && candidate.status !== TestRunTestCaseStatus.CANCELLED,
  )

  return unconsumed ?? candidates[0]
}

export function extractTestCaseTitleFromScenarioName(scenarioName: string): string | null {
  const bracketMatch = scenarioName.match(/^\[([^\]]+)\]/)
  if (bracketMatch) {
    return bracketMatch[1].trim()
  }

  const trimmedName = scenarioName.trim()
  return trimmedName.length > 0 ? trimmedName : null
}

export function findMatchingTestRunTestCase<T extends MatchableRunTestCase>(
  testRunTestCases: T[],
  { scenarioName, scenarioTags = [] }: ScenarioMatchInput,
): T | undefined {
  const suiteIdentifierTag = scenarioTags.find(tag => normalizeTagExpression(tag).startsWith('@ts_'))
  const testCaseIdentifierTag = scenarioTags.find(tag => normalizeTagExpression(tag).startsWith('@tc_'))
  const testCaseTitle = extractTestCaseTitleFromScenarioName(scenarioName)

  const bySuite = suiteIdentifierTag
    ? testRunTestCases.filter(testRunTestCase => {
        const identifierTag = testRunTestCase.testSuite
          ? getIdentifierTagByPrefix(testRunTestCase.testSuite.tags, 'ts_')
          : undefined

        return identifierTag?.tagExpression === normalizeTagExpression(suiteIdentifierTag)
      })
    : []

  if (bySuite.length > 0) {
    if (testCaseIdentifierTag) {
      const bySuiteAndTestCaseIdentifier = bySuite.filter(testRunTestCase => {
        const identifierTag = getIdentifierTagByPrefix(testRunTestCase.testCase.tags, 'tc_')
        return identifierTag?.tagExpression === normalizeTagExpression(testCaseIdentifierTag)
      })

      const matchedBySuiteAndTestCaseIdentifier = consumeCandidate(bySuiteAndTestCaseIdentifier)
      if (matchedBySuiteAndTestCaseIdentifier) {
        return matchedBySuiteAndTestCaseIdentifier
      }
    }

    if (testCaseTitle) {
      const bySuiteAndTitle = bySuite.filter(testRunTestCase => testRunTestCase.testCase.title === testCaseTitle)
      const matchedBySuiteAndTitle = consumeCandidate(bySuiteAndTitle)
      if (matchedBySuiteAndTitle) {
        return matchedBySuiteAndTitle
      }
    }

    return consumeCandidate(bySuite)
  }

  if (testCaseIdentifierTag) {
    const byTestCaseIdentifier = testRunTestCases.filter(testRunTestCase => {
      const identifierTag = getIdentifierTagByPrefix(testRunTestCase.testCase.tags, 'tc_')
      return identifierTag?.tagExpression === normalizeTagExpression(testCaseIdentifierTag)
    })

    const matchedByTestCaseIdentifier = consumeCandidate(byTestCaseIdentifier)
    if (matchedByTestCaseIdentifier) {
      return matchedByTestCaseIdentifier
    }
  }

  if (testCaseTitle) {
    const byTitle = testRunTestCases.filter(testRunTestCase => testRunTestCase.testCase.title === testCaseTitle)
    const matchedByTitle = consumeCandidate(byTitle)
    if (matchedByTitle) {
      return matchedByTitle
    }
  }

  return undefined
}
