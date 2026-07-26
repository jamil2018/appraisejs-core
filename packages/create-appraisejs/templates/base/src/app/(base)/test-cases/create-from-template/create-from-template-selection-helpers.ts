import { templateSelectionSchema } from '@/constants/form-opts/template-selection-form-opts'
import { getFieldErrorMessage } from '@/components/form/field-error-message'
import type { ActionResponseData } from '@/types/form/actionHandler'

import { isNamedRow } from '../test-case-shared-resource-rows'
import type { TemplateSelectionRow, TemplateTestCaseWithSteps } from './create-from-template-types'

export const templateSelectionFieldValidator = templateSelectionSchema.shape.templateTestCaseId

export { getFieldErrorMessage }

function isTemplateTestCaseStepParameter(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'defaultValue' in value &&
    'type' in value &&
    'order' in value
  )
}

function isTemplateTestCaseStepRow(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value &&
    'invocationJson' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTemplateTestCaseStepParameter)
  )
}

function isTemplateTestCaseWithSteps(value: unknown): value is TemplateTestCaseWithSteps {
  return (
    isNamedRow(value) && 'steps' in value && Array.isArray(value.steps) && value.steps.every(isTemplateTestCaseStepRow)
  )
}

export function getTemplateSelectionRows(data: ActionResponseData | undefined): TemplateSelectionRow[] {
  return Array.isArray(data) ? data.filter(isNamedRow) : []
}

export function getTemplateTestCasesWithSteps(data: ActionResponseData | undefined): TemplateTestCaseWithSteps[] {
  return Array.isArray(data) ? data.filter(isTemplateTestCaseWithSteps) : []
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
