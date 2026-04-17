import type {
  Locator,
  LocatorGroup,
  Module,
  Tag,
  TestCase,
  TestCaseStep,
  TestCaseStepParameter,
  TestSuite,
  TemplateStep,
  TemplateStepParameter,
} from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'
import type { NodeOrderMap } from '@/types/diagram/diagram'
import type { TestCasePickerRow } from '@/types/test-case-picker'

export type EditableTestCase = TestCase & {
  steps: (TestCaseStep & { parameters: TestCaseStepParameter[] })[]
  testSuiteIds: string[]
  tagIds: string[]
}

function isNamedRow(value: unknown): value is { id: string; name: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTagRow(value: unknown): value is Tag {
  return isNamedRow(value)
}

function isTestCaseStepParameterRow(value: unknown): value is TestCaseStepParameter {
  return typeof value === 'object' && value !== null && 'name' in value && 'value' in value && 'type' in value
}

function isTestCaseStepRow(value: unknown): value is TestCaseStep & { parameters: TestCaseStepParameter[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value &&
    'templateStepId' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTestCaseStepParameterRow)
  )
}

function isTestCaseRow(value: unknown): value is TestCasePickerRow {
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

function isTemplateStepParameterRow(value: unknown): value is TemplateStepParameter {
  return typeof value === 'object' && value !== null && 'id' in value && 'templateStepId' in value
}

function isTemplateStepRow(value: unknown): value is TemplateStep {
  return isNamedRow(value)
}

function isLocatorRow(value: unknown): value is Locator {
  return isNamedRow(value)
}

function isModuleRow(value: unknown): value is Module {
  return isNamedRow(value)
}

function isTestSuiteRow(value: unknown): value is TestSuite {
  return isNamedRow(value)
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return isNamedRow(value)
}

export function getTestCaseRows(data: ActionResponseData | undefined): TestCasePickerRow[] {
  return Array.isArray(data) ? data.filter(isTestCaseRow) : []
}

export function getEditableTestCase(data: ActionResponseData | undefined) {
  return isEditableTestCase(data) ? data : null
}

export function buildNodeOrderFromTestCaseSteps(steps: EditableTestCase['steps']): NodeOrderMap {
  return steps.reduce<NodeOrderMap>((acc, step) => {
    acc[step.id] = {
      order: step.order,
      label: step.label,
      gherkinStep: step.gherkinStep,
      icon: step.icon,
      parameters: (step.parameters || []).map(parameter => ({
        name: parameter.name,
        value: parameter.value,
        type: parameter.type,
        order: parameter.order,
      })),
      templateStepId: step.templateStepId,
    }
    return acc
  }, {})
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

export function getModuleRows(data: ActionResponseData | undefined): Module[] {
  return Array.isArray(data) ? data.filter(isModuleRow) : []
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
