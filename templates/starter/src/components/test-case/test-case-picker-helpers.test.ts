import { describe, expect, it } from 'vitest'

import {
  createSelectionState,
  getSavedTestCases,
  getSelectedIdsFromRowSelection,
  getSelectionSummaryLabel,
  testCaseMatchesQuery,
} from './test-case-picker-helpers'

const testCases = [
  {
    id: 'case-1',
    title: 'Login test',
    description: 'Checks login',
    tags: [{ id: 'tag-1', name: 'smoke' }],
    steps: [],
  },
  {
    id: 'case-2',
    title: 'Checkout test',
    description: 'Validates payment',
    tags: [{ id: 'tag-2', name: 'regression' }],
    steps: [],
  },
] as never

describe('test-case-picker helpers', () => {
  it('creates row selection state and selected ids', () => {
    expect(createSelectionState(['case-1'])).toEqual({ 'case-1': true })
    expect(getSelectedIdsFromRowSelection(testCases, { 'case-2': true })).toEqual(['case-2'])
  })

  it('filters and summarizes saved cases', () => {
    expect(testCaseMatchesQuery(testCases[0], 'smoke')).toBe(true)
    expect(testCaseMatchesQuery(testCases[0], 'payment')).toBe(false)
    expect(getSavedTestCases(testCases, ['case-2'])).toEqual([testCases[1]])
    expect(getSelectionSummaryLabel('Selected test case(s)')).toBe('test case(s)')
  })
})
