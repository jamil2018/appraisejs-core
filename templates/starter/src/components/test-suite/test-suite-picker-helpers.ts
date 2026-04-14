import { getFilterTags } from '@/lib/tag-utils'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'

export type DraftSelectionMap = Record<string, TestSuiteSelection>

export function createDraftSelections(selectedSuites: TestSuiteSelection[]): DraftSelectionMap {
  return selectedSuites.reduce<DraftSelectionMap>((acc, selection) => {
    acc[selection.testSuiteId] = {
      testSuiteId: selection.testSuiteId,
      runAll: selection.runAll,
      testCaseIds: selection.testCaseIds,
    }
    return acc
  }, {})
}

export function normalizeSuiteSelection(
  testSuite: TestSuitePickerRow,
  selection: TestSuiteSelection,
): TestSuiteSelection | null {
  const childIds = testSuite.testCases.map(testCase => testCase.id)

  if (childIds.length === 0) {
    return null
  }

  if (selection.runAll) {
    return {
      testSuiteId: testSuite.id,
      runAll: true,
      testCaseIds: [],
    }
  }

  const selectedChildIds = selection.testCaseIds.filter(testCaseId => childIds.includes(testCaseId))
  if (selectedChildIds.length === 0) {
    return null
  }

  if (selectedChildIds.length === childIds.length) {
    return {
      testSuiteId: testSuite.id,
      runAll: true,
      testCaseIds: [],
    }
  }

  return {
    testSuiteId: testSuite.id,
    runAll: false,
    testCaseIds: selectedChildIds,
  }
}

export function suiteMatchesQuery(testSuite: TestSuitePickerRow, query: string): boolean {
  if (!query) {
    return true
  }

  const normalizedQuery = query.toLowerCase()
  const searchableText = [
    testSuite.name,
    testSuite.description ?? '',
    testSuite.module.name,
    ...getFilterTags(testSuite.tags).map(tag => tag.name),
    ...testSuite.testCases.flatMap(testCase => [
      testCase.title,
      testCase.description ?? '',
      ...getFilterTags(testCase.tags).map(tag => tag.name),
    ]),
  ]
    .join(' ')
    .toLowerCase()

  return searchableText.includes(normalizedQuery)
}
