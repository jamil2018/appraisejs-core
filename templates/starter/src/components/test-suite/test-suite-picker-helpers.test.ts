import { describe, expect, it } from 'vitest'

import type { TestSuitePickerRow } from '@/types/test-suite-picker'

import { createDraftSelections, normalizeSuiteSelection, suiteMatchesQuery } from './test-suite-picker-helpers'

const suite: TestSuitePickerRow = {
  id: 'suite-1',
  name: 'Checkout',
  description: 'Checkout flow',
  module: { id: 'module-1', name: 'Payments' } as never,
  tags: [{ id: 'tag-1', name: 'smoke', type: 'FILTER', tagExpression: '@smoke' }] as never,
  testCases: [
    {
      id: 'case-1',
      title: 'Pay with card',
      description: 'Card path',
      steps: [],
      tags: [{ id: 'tag-2', name: 'regression', type: 'FILTER', tagExpression: '@regression' }],
    } as never,
    {
      id: 'case-2',
      title: 'Pay with wallet',
      description: 'Wallet path',
      steps: [],
      tags: [],
    } as never,
  ],
} as never

describe('test-suite-picker helpers', () => {
  it('creates draft maps and normalizes partial/full selections', () => {
    expect(
      createDraftSelections([
        {
          testSuiteId: 'suite-1',
          runAll: false,
          testCaseIds: ['case-1'],
        },
      ]),
    ).toEqual({
      'suite-1': {
        testSuiteId: 'suite-1',
        runAll: false,
        testCaseIds: ['case-1'],
      },
    })

    expect(
      normalizeSuiteSelection(suite, {
        testSuiteId: 'suite-1',
        runAll: false,
        testCaseIds: ['case-1', 'case-2'],
      }),
    ).toEqual({
      testSuiteId: 'suite-1',
      runAll: true,
      testCaseIds: [],
    })
  })

  it('matches suites against module, suite, tag, and child test text', () => {
    expect(suiteMatchesQuery(suite, 'payments')).toBe(true)
    expect(suiteMatchesQuery(suite, 'wallet')).toBe(true)
    expect(suiteMatchesQuery(suite, 'smoke')).toBe(true)
    expect(suiteMatchesQuery(suite, 'missing')).toBe(false)
  })
})
