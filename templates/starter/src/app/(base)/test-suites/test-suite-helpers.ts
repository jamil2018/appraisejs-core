import type { Module, Tag, TestCase, TestSuite as PrismaTestSuite } from '@prisma/client'

import { testSuiteSchema, type TestSuite } from '@/constants/form-opts/test-suite-form-opts'
import { getFilterTags } from '@/lib/tag-utils'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'
import type { TestCasePickerRow } from '@/types/test-case-picker'

export type TestSuiteTableRow = PrismaTestSuite & {
  tags?: Tag[]
  module: Module
  testCases: TestCase[]
}

export type EditableTestSuite = PrismaTestSuite & {
  testCases: TestCase[]
  module: Module
  tags: Tag[]
}

export type TestSuiteGroupOption = {
  id: string
  name: string
}

export type TestSuiteFormSubmitAction = (_prev: unknown, value: TestSuite, id?: string) => Promise<ActionResponse>

export const testSuiteFieldValidators = {
  name: testSuiteSchema.shape.name,
  moduleId: testSuiteSchema.shape.moduleId,
}

export const testSuiteQuickTips = [
  {
    title: 'Choose a descriptive name',
    description: 'Use clear, specific names that indicate the purpose',
  },
  {
    title: 'Group related tests',
    description: 'Organize tests that validate the same feature together',
  },
  {
    title: 'Use meaningful tags',
    description: 'Tags help filter and categorize effectively',
  },
] as const

export type TestSuiteInfoCard = {
  showHighlightGroup: boolean
  highlight: string
  legend: string
  defaultText: string
}

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
  return response.error || 'An error occurred'
}

export function getModuleOptions(modules: Module[]) {
  return modules.map(module => ({
    label: module.name,
    value: module.id,
  }))
}

export function getTagOptions(tags: Tag[]) {
  return tags.map(tag => ({
    label: tag.name,
    value: tag.id,
  }))
}

function isNamedRow(value: unknown): value is { id: string; name: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTagRow(value: unknown): value is Tag {
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

function isModuleRow(value: unknown): value is Module {
  return isNamedRow(value)
}

function isTestSuiteTableRow(value: unknown): value is TestSuiteTableRow {
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

function isEditableTestSuite(value: unknown): value is EditableTestSuite {
  return (
    isTestSuiteTableRow(value) &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow)
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

export function getTestSuiteTableRows(data: ActionResponseData | undefined): TestSuiteTableRow[] {
  return Array.isArray(data) ? data.filter(isTestSuiteTableRow) : []
}

export function buildTestSuiteInfoCards(testSuites: TestSuiteTableRow[]): TestSuiteInfoCard[] {
  const emptyTestSuites = testSuites.filter(testSuite => testSuite.testCases.length === 0)
  const latestCreatedTestSuite = [...testSuites].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  const tagSuiteCountMap = new Map<string, { name: string; suiteCount: number }>()

  for (const testSuite of testSuites) {
    for (const tag of getFilterTags(testSuite.tags || [])) {
      const currentTag = tagSuiteCountMap.get(tag.id)

      if (currentTag) {
        currentTag.suiteCount += 1
      } else {
        tagSuiteCountMap.set(tag.id, {
          name: tag.name,
          suiteCount: 1,
        })
      }
    }
  }

  const mostCommonTagWithSuites = [...tagSuiteCountMap.values()].sort((a, b) => {
    if (b.suiteCount !== a.suiteCount) {
      return b.suiteCount - a.suiteCount
    }

    return a.name.localeCompare(b.name)
  })[0]

  return [
    {
      showHighlightGroup: testSuites.length > 0,
      highlight: emptyTestSuites.length.toString(),
      legend: 'Empty test suite(s)',
      defaultText: 'Empty test suites count. Will update when test suites are created.',
    },
    {
      showHighlightGroup: testSuites.length > 0,
      highlight: latestCreatedTestSuite ? latestCreatedTestSuite.name : 'N/A',
      legend: 'Latest test suite',
      defaultText: 'Latest created test suite. Will update when test suites are created.',
    },
    ...(mostCommonTagWithSuites
      ? [
          {
            showHighlightGroup: true,
            highlight: mostCommonTagWithSuites.name,
            legend: 'Most common tag',
            defaultText: 'Most common suite tag will appear here when test suites have tags.',
          },
        ]
      : []),
  ]
}

export function getEditableTestSuite(data: ActionResponseData | undefined) {
  return isEditableTestSuite(data) ? data : null
}

export function getTemplateStepGroupRows(data: ActionResponseData | undefined): TestSuiteGroupOption[] {
  return Array.isArray(data) ? data.filter(isGroupOption) : []
}
