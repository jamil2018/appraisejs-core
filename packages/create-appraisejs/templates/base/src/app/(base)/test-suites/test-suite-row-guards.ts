import type { Module, Tag, TestCase, TestSuite as PrismaTestSuite } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'
import type { TestCasePickerRow } from '@/types/test-case-picker'

import type { TestSuiteGroupOption, TestSuiteTableRow } from './test-suite-types'

export function isCreatedTestSuite(value: unknown): value is PrismaTestSuite {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isNamedRow(value: unknown): value is { id: string; name: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

export function isTagRow(value: unknown): value is Tag {
  return isNamedRow(value)
}

function isTestCaseRow(value: unknown): value is TestCase {
  return typeof value === 'object' && value !== null && 'id' in value && 'title' in value
}

function isTestSuitePickerRow(value: unknown): value is TestCasePickerRow {
  return (
    isTestCaseRow(value) &&
    'steps' in value &&
    Array.isArray(value.steps) &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow)
  )
}

export function isModuleRow(value: unknown): value is Module {
  return isNamedRow(value)
}

export function isTestSuiteTableRow(value: unknown): value is TestSuiteTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'module' in value &&
    isModuleRow(value.module) &&
    'testCases' in value &&
    Array.isArray(value.testCases) &&
    value.testCases.every(isTestCaseRow) &&
    (!('tags' in value) || value.tags === undefined || (Array.isArray(value.tags) && value.tags.every(isTagRow)))
  )
}

function isGroupOption(value: unknown): value is TestSuiteGroupOption {
  return isNamedRow(value)
}

export function getTestCasePickerRows(data: ActionResponseData | undefined): TestCasePickerRow[] {
  return Array.isArray(data) ? data.filter(isTestSuitePickerRow) : []
}

export function getModuleRows(data: ActionResponseData | undefined): Module[] {
  return Array.isArray(data) ? data.filter(isModuleRow) : []
}

export function getTagRows(data: ActionResponseData | undefined): Tag[] {
  return Array.isArray(data) ? data.filter(isTagRow) : []
}

export function getCreatedTestSuite(data: ActionResponseData | undefined) {
  return isCreatedTestSuite(data) ? data : null
}

export function getTestSuiteTableRows(data: ActionResponseData | undefined): TestSuiteTableRow[] {
  return Array.isArray(data) ? data.filter(isTestSuiteTableRow) : []
}

export function getTemplateStepGroupRows(data: ActionResponseData | undefined): TestSuiteGroupOption[] {
  return Array.isArray(data) ? data.filter(isGroupOption) : []
}
