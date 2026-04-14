import { BrowserEngine } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  buildTestRunSubmitValue,
  getTestRunSuccessPath,
  testSelectionTypes,
  validateTagSelections,
  validateTestSuiteSelections,
} from './test-run-form-helpers'

describe('test-run-form helpers', () => {
  it('strips tags when the test suite selection mode is active', () => {
    expect(
      buildTestRunSubmitValue(
        {
          name: 'Nightly',
          environmentId: 'env-1',
          tags: ['tag-1'],
          testWorkersCount: 1,
          browserEngine: BrowserEngine.CHROMIUM,
          testSuites: [{ testSuiteId: 'suite-1', runAll: true, testCaseIds: [] }],
        },
        testSelectionTypes.TEST_SUITES,
      ),
    ).toEqual({
      name: 'Nightly',
      environmentId: 'env-1',
      tags: [],
      testWorkersCount: 1,
      browserEngine: BrowserEngine.CHROMIUM,
      testSuites: [{ testSuiteId: 'suite-1', runAll: true, testCaseIds: [] }],
    })
  })

  it('returns validation messages for empty tags and invalid partial suite selections', () => {
    expect(validateTagSelections([], testSelectionTypes.TAGS)).toBe('Tags are required')
    expect(
      validateTestSuiteSelections(
        [{ testSuiteId: 'suite-1', runAll: false, testCaseIds: [] }],
        testSelectionTypes.TEST_SUITES,
      ),
    ).toBe('Partial suite selections must include at least one test case')
  })

  it('builds the success route from returned action data', () => {
    expect(getTestRunSuccessPath({ id: 'run-1' })).toBe('/test-runs/run-1')
    expect(getTestRunSuccessPath(undefined)).toBe('/test-runs')
  })
})
