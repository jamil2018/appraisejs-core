import type { Environment, Tag } from '@prisma/client'

import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'
import type { TestSuitePickerRow } from '@/types/test-suite-picker'

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save test run.'
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
