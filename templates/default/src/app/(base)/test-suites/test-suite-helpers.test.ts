import { describe, expect, it } from 'vitest'

import {
  buildTestSuiteInfoCards,
  getEditableTestSuite,
  getModuleOptions,
  getTestCasePickerRows,
  getTestSuiteTableRows,
} from './test-suite-helpers'

describe('test-suite helpers', () => {
  it('formats module options and narrows test case picker rows', () => {
    expect(getModuleOptions([{ id: 'module-1', name: 'Payments' } as never])).toEqual([
      { label: 'Payments', value: 'module-1' },
    ])

    expect(
      getTestCasePickerRows([
        {
          id: 'case-1',
          title: 'Login',
          steps: [],
          tags: [{ id: 'tag-1', name: 'smoke' }],
        },
        {
          id: 'broken',
          title: 'Broken',
          steps: [],
          tags: ['bad'],
        },
      ]),
    ).toEqual([
      {
        id: 'case-1',
        title: 'Login',
        steps: [],
        tags: [{ id: 'tag-1', name: 'smoke' }],
      },
    ])
  })

  it('narrows test suite table and editable rows', () => {
    const tableRows = getTestSuiteTableRows([
      {
        id: 'suite-1',
        name: 'Smoke',
        module: { id: 'module-1', name: 'Payments' },
        testCases: [{ id: 'case-1', title: 'Login' }],
        tags: [{ id: 'tag-1', name: 'smoke' }],
      },
    ])

    expect(tableRows).toHaveLength(1)
    expect(buildTestSuiteInfoCards(tableRows).map(card => card.legend)).toContain('Latest test suite')

    expect(
      getEditableTestSuite({
        id: 'suite-1',
        name: 'Smoke',
        module: { id: 'module-1', name: 'Payments' },
        moduleId: 'module-1',
        testCases: [{ id: 'case-1', title: 'Login' }],
        tags: [{ id: 'tag-1', name: 'smoke' }],
      }),
    ).not.toBeNull()
  })
})
