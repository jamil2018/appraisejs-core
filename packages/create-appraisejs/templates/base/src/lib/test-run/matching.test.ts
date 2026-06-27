import { describe, expect, it } from 'vitest'
import { TagType, TestRunTestCaseStatus } from '@prisma/client'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'

const identifierTag = (tagExpression: string) => ({
  name: tagExpression.slice(1),
  tagExpression,
  type: TagType.IDENTIFIER,
})

const runTestCase = (
  overrides: Partial<Parameters<typeof findMatchingTestRunTestCase>[0][number]> & {
    id: string
    title: string
    suiteTag?: string
    testCaseTag?: string
  },
) => ({
  id: overrides.id,
  status: overrides.status ?? TestRunTestCaseStatus.PENDING,
  testSuiteId: overrides.testSuiteId ?? 'suite-1',
  testCase: {
    id: `case-${overrides.id}`,
    title: overrides.title,
    tags: overrides.testCaseTag ? [identifierTag(overrides.testCaseTag)] : [],
  },
  testSuite: overrides.suiteTag
    ? {
        id: overrides.testSuiteId ?? 'suite-1',
        name: 'Smoke Suite',
        tags: [identifierTag(overrides.suiteTag)],
      }
    : null,
})

describe('findMatchingTestRunTestCase', () => {
  it('prefers suite and test case identifier tags over scenario titles', () => {
    const suiteOnlyMatch = runTestCase({
      id: 'suite-only',
      title: 'Checkout',
      suiteTag: '@ts_checkout',
      testCaseTag: '@tc_wrong',
    })
    const exactIdentifierMatch = runTestCase({
      id: 'exact',
      title: 'Different title',
      suiteTag: '@ts_checkout',
      testCaseTag: '@tc_pay',
    })

    const match = findMatchingTestRunTestCase([suiteOnlyMatch, exactIdentifierMatch], {
      scenarioName: '[Checkout] Pay with card',
      scenarioTags: ['ts_checkout', '@tc_pay'],
    })

    expect(match).toBe(exactIdentifierMatch)
  })

  it('falls back to bracketed scenario titles and chooses an unfinished candidate first', () => {
    const completedCandidate = runTestCase({
      id: 'completed',
      status: TestRunTestCaseStatus.COMPLETED,
      title: 'Checkout',
    })
    const pendingCandidate = runTestCase({
      id: 'pending',
      status: TestRunTestCaseStatus.PENDING,
      title: 'Checkout',
    })

    const match = findMatchingTestRunTestCase([completedCandidate, pendingCandidate], {
      scenarioName: '[Checkout] Pay with card',
    })

    expect(match).toBe(pendingCandidate)
  })
})
