import type { TestRun } from '@/constants/form-opts/test-run-form-opts'
import type { TestSuiteSelection } from '@/types/test-suite-picker'

export const testSelectionTypes = {
  TAGS: 'tags',
  TEST_SUITES: 'testSuites',
} as const

export type TestSelectionType = (typeof testSelectionTypes)[keyof typeof testSelectionTypes]

export function buildTestRunSubmitValue(value: TestRun, selectionType: TestSelectionType): TestRun {
  return {
    ...value,
    tags: selectionType === testSelectionTypes.TAGS ? value.tags : [],
    testSuites: selectionType === testSelectionTypes.TEST_SUITES ? value.testSuites : [],
  }
}

export function validateTagSelections(value: string[], selectionType: TestSelectionType) {
  if (selectionType === testSelectionTypes.TAGS && (!Array.isArray(value) || value.length === 0)) {
    return 'Tags are required'
  }

  return undefined
}

export function validateTestSuiteSelections(value: TestSuiteSelection[], selectionType: TestSelectionType) {
  if (selectionType !== testSelectionTypes.TEST_SUITES) {
    return undefined
  }

  if (!Array.isArray(value) || value.length === 0) {
    return 'At least one test suite is required'
  }

  const invalidSuite = value.find(suiteSelection => !suiteSelection.runAll && suiteSelection.testCaseIds.length === 0)
  if (invalidSuite) {
    return 'Partial suite selections must include at least one test case'
  }

  return undefined
}

export function getInitialTestSelectionType(defaultValues?: TestRun): TestSelectionType {
  return defaultValues?.testSuites?.length ? testSelectionTypes.TEST_SUITES : testSelectionTypes.TAGS
}
