import type { RowSelectionState } from '@tanstack/react-table'

import type { TestCasePickerRow } from '@/types/test-case-picker'

export function createSelectionState(selectedIds: string[]): RowSelectionState {
  return selectedIds.reduce<RowSelectionState>((acc, id) => {
    acc[id] = true
    return acc
  }, {})
}

export function testCaseMatchesQuery(testCase: TestCasePickerRow, filterValue: unknown): boolean {
  const query = String(filterValue ?? '')
    .trim()
    .toLowerCase()
  if (!query) {
    return true
  }

  const searchableText = [testCase.title, testCase.description ?? '', ...testCase.tags.map(tag => tag.name)]
    .join(' ')
    .toLowerCase()

  return searchableText.includes(query)
}

export function getSavedTestCases(testCases: TestCasePickerRow[], selectedIds: string[]): TestCasePickerRow[] {
  return selectedIds
    .map(selectedId => testCases.find(testCase => testCase.id === selectedId))
    .filter((testCase): testCase is TestCasePickerRow => Boolean(testCase))
}

export function getSelectedIdsFromRowSelection(
  testCases: TestCasePickerRow[],
  rowSelection: RowSelectionState,
): string[] {
  return testCases.filter(testCase => rowSelection[testCase.id]).map(testCase => testCase.id)
}

export function getSelectionSummaryLabel(selectedLabel: string) {
  return selectedLabel.replace(/^selected\s+/i, '')
}
