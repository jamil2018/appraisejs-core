import { getFilterTags } from '@/lib/tag-filters'
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

export function applySuiteCheckboxSelection(
  current: DraftSelectionMap,
  testSuite: TestSuitePickerRow,
  checked: boolean,
): DraftSelectionMap {
  const next = { ...current }

  if (!checked) {
    delete next[testSuite.id]
    return next
  }

  next[testSuite.id] = {
    testSuiteId: testSuite.id,
    runAll: true,
    testCaseIds: [],
  }

  return next
}

export function applyChildCheckboxSelection(
  current: DraftSelectionMap,
  testSuite: TestSuitePickerRow,
  testCaseId: string,
  checked: boolean,
): DraftSelectionMap {
  const childIds = testSuite.testCases.map(testCase => testCase.id)
  const currentSelection = current[testSuite.id]
  const nextSelectedIds = new Set(currentSelection?.runAll ? childIds : (currentSelection?.testCaseIds ?? []))

  if (checked) {
    nextSelectedIds.add(testCaseId)
  } else {
    nextSelectedIds.delete(testCaseId)
  }

  const next = { ...current }

  if (nextSelectedIds.size === 0) {
    delete next[testSuite.id]
    return next
  }

  if (nextSelectedIds.size === childIds.length) {
    next[testSuite.id] = {
      testSuiteId: testSuite.id,
      runAll: true,
      testCaseIds: [],
    }
    return next
  }

  next[testSuite.id] = {
    testSuiteId: testSuite.id,
    runAll: false,
    testCaseIds: Array.from(nextSelectedIds),
  }

  return next
}

export function buildNormalizedSelectionsFromDraft(
  testSuites: TestSuitePickerRow[],
  draftSelections: DraftSelectionMap,
): TestSuiteSelection[] {
  return testSuites.reduce<TestSuiteSelection[]>((selections, testSuite) => {
    const selection = draftSelections[testSuite.id]
    if (selection !== null && selection !== undefined) {
      const normalizedSelection = normalizeSuiteSelection(testSuite, selection)
      if (normalizedSelection) {
        selections.push(normalizedSelection)
      }
    }

    return selections
  }, [])
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
