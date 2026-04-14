import type {
  Locator,
  LocatorGroup,
  Tag,
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
  TemplateStep,
  TemplateStepParameter,
  TestSuite,
} from '@prisma/client'

import { templateSelectionSchema } from '@/constants/form-opts/template-selection-form-opts'
import {
  templateTestCaseToTestCaseConverter,
  validateConvertedTestCaseData,
  type ConvertedTestCaseData,
} from '@/lib/transformers/template-test-case-converter'
import type { ActionResponseData } from '@/types/form/actionHandler'

export type TemplateSelectionOption = {
  label: string
  value: string
}

export type TemplateSelectionRow = {
  id: string
  name: string
}

export type TemplateTestCaseWithSteps = TemplateTestCase & {
  steps: (TemplateTestCaseStep & {
    parameters: TemplateTestCaseStepParameter[]
  })[]
}

export const templateSelectionFieldValidator = templateSelectionSchema.shape.templateTestCaseId

export function getFieldErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

function isNamedRow(value: unknown): value is TemplateSelectionRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTemplateTestCaseStepParameter(value: unknown): value is TemplateTestCaseStepParameter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'defaultValue' in value &&
    'type' in value &&
    'order' in value
  )
}

function isTemplateTestCaseStepRow(value: unknown): value is TemplateTestCaseStep & {
  parameters: TemplateTestCaseStepParameter[]
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value &&
    'templateStepId' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTemplateTestCaseStepParameter)
  )
}

function isTemplateTestCaseWithSteps(value: unknown): value is TemplateTestCaseWithSteps {
  return (
    isNamedRow(value) &&
    'steps' in value &&
    Array.isArray(value.steps) &&
    value.steps.every(isTemplateTestCaseStepRow)
  )
}

function isTemplateStepParameterRow(value: unknown): value is TemplateStepParameter {
  return typeof value === 'object' && value !== null && 'id' in value && 'templateStepId' in value
}

function isTemplateStepRow(value: unknown): value is TemplateStep {
  return isNamedRow(value)
}

function isLocatorRow(value: unknown): value is Locator {
  return isNamedRow(value)
}

function isTestSuiteRow(value: unknown): value is TestSuite {
  return isNamedRow(value)
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return isNamedRow(value)
}

function isTagRow(value: unknown): value is Tag {
  return isNamedRow(value)
}

export function getTemplateSelectionRows(data: ActionResponseData | undefined): TemplateSelectionRow[] {
  return Array.isArray(data) ? data.filter(isNamedRow) : []
}

export function getTemplateSelectionOptions(templateTestCases: TemplateSelectionRow[]) {
  return templateTestCases.map(templateTestCase => ({
    label: templateTestCase.name,
    value: templateTestCase.id,
  }))
}

export function getTemplateTestCaseWithSteps(data: ActionResponseData | undefined) {
  return isTemplateTestCaseWithSteps(data) ? data : null
}

export function getTemplateStepParamRows(data: ActionResponseData | undefined): TemplateStepParameter[] {
  return Array.isArray(data) ? data.filter(isTemplateStepParameterRow) : []
}

export function getTemplateStepRows(data: ActionResponseData | undefined): TemplateStep[] {
  return Array.isArray(data) ? data.filter(isTemplateStepRow) : []
}

export function getLocatorRows(data: ActionResponseData | undefined): Locator[] {
  return Array.isArray(data) ? data.filter(isLocatorRow) : []
}

export function getTestSuiteRows(data: ActionResponseData | undefined): TestSuite[] {
  return Array.isArray(data) ? data.filter(isTestSuiteRow) : []
}

export function getLocatorGroupRows(data: ActionResponseData | undefined): LocatorGroup[] {
  return Array.isArray(data) ? data.filter(isLocatorGroupRow) : []
}

export function getTagRows(data: ActionResponseData | undefined): Tag[] {
  return Array.isArray(data) ? data.filter(isTagRow) : []
}

export function getConvertedTemplateTestCaseData(templateTestCase: TemplateTestCaseWithSteps): {
  convertedData: ConvertedTestCaseData | null
  error: string | null
} {
  const convertedData = templateTestCaseToTestCaseConverter(templateTestCase)
  const validation = validateConvertedTestCaseData(convertedData)

  if (!validation.isValid) {
    return {
      convertedData: null,
      error: validation.errors[0] || 'Invalid test case',
    }
  }

  return {
    convertedData,
    error: null,
  }
}
