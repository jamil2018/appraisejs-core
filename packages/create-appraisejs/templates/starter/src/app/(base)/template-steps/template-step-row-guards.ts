import type { TemplateStepParameter } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

import type {
  EditableTemplateStep,
  TemplateStepGroupOption,
  TemplateStepParameterSummary,
  TemplateStepTableRow,
} from './template-step-types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function isNamedRow(value: unknown): value is TemplateStepGroupOption {
  return isRecord(value) && 'id' in value && 'name' in value
}

function isTemplateStepParameterRow(value: unknown): value is TemplateStepParameter {
  return isRecord(value) && 'id' in value && 'name' in value && 'type' in value && 'order' in value
}

function isTemplateStepParameterSummary(value: unknown): value is TemplateStepParameterSummary {
  return isRecord(value) && 'id' in value && 'name' in value
}

function hasTemplateStepShape(value: unknown): value is UnknownRecord & { parameters: unknown[] } {
  const requiredFields = [
    'id',
    'name',
    'createdAt',
    'updatedAt',
    'type',
    'signature',
    'icon',
    'templateStepGroupId',
    'templateStepGroup',
    'parameters',
  ] as const

  return (
    isRecord(value) &&
    requiredFields.every(field => field in value) &&
    Array.isArray(value.parameters)
  )
}

function isEditableTemplateStep(value: unknown): value is EditableTemplateStep {
  return hasTemplateStepShape(value) && value.parameters.every(isTemplateStepParameterRow)
}

function isTemplateStepTableRow(value: unknown): value is TemplateStepTableRow {
  return hasTemplateStepShape(value) && value.parameters.every(isTemplateStepParameterSummary)
}

export function getTemplateStepGroupRows(data: ActionResponseData | undefined): TemplateStepGroupOption[] {
  return Array.isArray(data) ? data.filter(isNamedRow) : []
}

export function getEditableTemplateStep(data: ActionResponseData | undefined) {
  return isEditableTemplateStep(data) ? data : null
}

export function getTemplateStepRows(data: ActionResponseData | undefined): TemplateStepTableRow[] {
  return Array.isArray(data) ? data.filter(isTemplateStepTableRow) : []
}
