import { getFilterTags } from '@/lib/tag-filters'

import type { TestSuiteInfoCard, TestSuiteTableRow } from './test-suite-types'

export function buildTestSuiteInfoCards(testSuites: TestSuiteTableRow[]): TestSuiteInfoCard[] {
  const emptyTestSuites = testSuites.filter(testSuite => testSuite.testCases.length === 0)
  const latestCreatedTestSuite = [...testSuites].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  const tagSuiteCountMap = new Map<string, { name: string; suiteCount: number }>()

  for (const testSuite of testSuites) {
    for (const tag of getFilterTags(testSuite.tags || [])) {
      const currentTag = tagSuiteCountMap.get(tag.id)

      if (currentTag) {
        currentTag.suiteCount += 1
      } else {
        tagSuiteCountMap.set(tag.id, {
          name: tag.name,
          suiteCount: 1,
        })
      }
    }
  }

  const mostCommonTagWithSuites = [...tagSuiteCountMap.values()].sort((a, b) => {
    if (b.suiteCount !== a.suiteCount) {
      return b.suiteCount - a.suiteCount
    }

    return a.name.localeCompare(b.name)
  })[0]

  return [
    {
      showHighlightGroup: testSuites.length > 0,
      highlight: emptyTestSuites.length.toString(),
      legend: 'Empty test suite(s)',
      defaultText: 'Empty test suites count. Will update when test suites are created.',
    },
    {
      showHighlightGroup: testSuites.length > 0,
      highlight: latestCreatedTestSuite ? latestCreatedTestSuite.name : 'N/A',
      legend: 'Latest test suite',
      defaultText: 'Latest created test suite. Will update when test suites are created.',
    },
    ...(mostCommonTagWithSuites
      ? [
          {
            showHighlightGroup: true,
            highlight: mostCommonTagWithSuites.name,
            legend: 'Most common tag',
            defaultText: 'Most common suite tag will appear here when test suites have tags.',
          },
        ]
      : []),
  ]
}
