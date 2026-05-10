import { testRunSchema, type TestRun } from '@/constants/form-opts/test-run-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

export type TestRunFormSubmitAction = (_prev: unknown, value: TestRun, id?: string) => Promise<ActionResponse>

export const testRunFieldValidators = {
  name: testRunSchema.shape.name,
  environmentId: testRunSchema.shape.environmentId,
  testWorkersCount: testRunSchema.shape.testWorkersCount.unwrap(),
  browserEngine: testRunSchema.shape.browserEngine,
}

export {
  getActionErrorMessage,
  getEnvironmentRows,
  getTagRows,
  getTestRunSuccessPath,
  getTestSuitePickerRows,
} from './test-run-form-data-helpers'
export { getBrowserEngineOptions, getFieldErrorMessage, testRunQuickTips } from './test-run-form-display-helpers'
export {
  buildTestRunSubmitValue,
  getInitialTestSelectionType,
  testSelectionTypes,
  validateTagSelections,
  validateTestSuiteSelections,
  type TestSelectionType,
} from './test-run-form-selection-helpers'
