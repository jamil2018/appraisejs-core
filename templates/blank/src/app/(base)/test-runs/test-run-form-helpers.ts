import { BrowserEngine, type Environment, type Tag } from '@prisma/client'

import { testRunSchema, type TestRun } from '@/constants/form-opts/test-run-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'

export const testSelectionTypes = {
  TAGS: 'tags',
  TEST_SUITES: 'testSuites',
} as const

export type TestSelectionType = (typeof testSelectionTypes)[keyof typeof testSelectionTypes]

export type TestRunFormSubmitAction = (_prev: unknown, value: TestRun, id?: string) => Promise<ActionResponse>

export const testRunFieldValidators = {
  name: testRunSchema.shape.name,
  environmentId: testRunSchema.shape.environmentId,
  testWorkersCount: testRunSchema.shape.testWorkersCount.unwrap(),
  browserEngine: testRunSchema.shape.browserEngine,
}

export const testRunQuickTips = [
  {
    title: 'Choose a descriptive name',
    description: 'Use clear, specific names that indicate the purpose for your test run',
  },
  {
    title: 'Select the environment for your test run',
    description: 'Choose the environment that best suits your selected tests',
  },
  {
    title: 'Select the browser engine for your test run',
    description: 'Select the browser engine that is compatible with your selected test cases',
  },
  {
    title: 'Select the test suites or tags for your test run',
    description: 'You can filter by tags or browse suites and choose full suites or child subsets',
  },
  {
    title: 'Select the test workers count for your test run',
    description: 'Parallel workers can be used to run your test cases in parallel to speed up the test execution',
  },
] as const

export function getFieldErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save test run.'
}

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

export function getTestRunSuccessPath(data: ActionResponseData | undefined) {
  if (typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string') {
    return `/test-runs/${data.id}`
  }

  return '/test-runs'
}

function isEnvironmentRow(value: unknown): value is Environment {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTagRow(value: unknown): value is Tag {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isModuleRow(value: unknown) {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTestCaseRow(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    'steps' in value &&
    Array.isArray(value.steps) &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow)
  )
}

function isTestSuitePickerRow(value: unknown): value is TestSuitePickerRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'module' in value &&
    isModuleRow(value.module) &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow) &&
    'testCases' in value &&
    Array.isArray(value.testCases) &&
    value.testCases.every(isTestCaseRow)
  )
}

export function getEnvironmentRows(data: ActionResponseData | undefined): Environment[] {
  return Array.isArray(data) ? data.filter(isEnvironmentRow) : []
}

export function getTagRows(data: ActionResponseData | undefined): Tag[] {
  return Array.isArray(data) ? data.filter(isTagRow) : []
}

export function getTestSuitePickerRows(data: ActionResponseData | undefined): TestSuitePickerRow[] {
  return Array.isArray(data) ? data.filter(isTestSuitePickerRow) : []
}

export function getInitialTestSelectionType(defaultValues?: TestRun): TestSelectionType {
  return defaultValues?.testSuites?.length ? testSelectionTypes.TEST_SUITES : testSelectionTypes.TAGS
}

export function getBrowserEngineOptions() {
  return [
    { label: 'Chromium', value: BrowserEngine.CHROMIUM },
    { label: 'Firefox', value: BrowserEngine.FIREFOX },
    { label: 'WebKit', value: BrowserEngine.WEBKIT },
  ] as const
}
