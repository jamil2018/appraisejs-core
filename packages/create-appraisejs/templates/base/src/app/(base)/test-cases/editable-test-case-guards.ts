import type { TestCaseStep, TestCaseStepParameter } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

import type { EditableTestCase } from './editable-test-case-types'

function isTestCaseStepParameterRow(value: unknown): value is TestCaseStepParameter {
  return typeof value === 'object' && value !== null && 'name' in value && 'value' in value && 'type' in value
}

function isTestCaseStepRow(value: unknown): value is TestCaseStep & { parameters: TestCaseStepParameter[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value &&
    'invocationJson' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTestCaseStepParameterRow)
  )
}

function isEditableTestCase(value: unknown): value is EditableTestCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    'steps' in value &&
    Array.isArray(value.steps) &&
    value.steps.every(isTestCaseStepRow) &&
    'testSuiteIds' in value &&
    Array.isArray(value.testSuiteIds) &&
    'tagIds' in value &&
    Array.isArray(value.tagIds)
  )
}

export function getEditableTestCase(data: ActionResponseData | undefined) {
  return isEditableTestCase(data) ? data : null
}
