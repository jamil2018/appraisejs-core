import {
  templateStepGroupSchema,
  type TemplateStepGroup as TemplateStepGroupFormValues,
} from '@/constants/form-opts/template-step-group-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export const templateStepGroupTypes = ['ACTION', 'VALIDATION'] as const

export type TemplateStepGroupType = (typeof templateStepGroupTypes)[number]

export type TemplateStepGroupTableRow = {
  id: string
  name: string
  description: string | null
  type: TemplateStepGroupType
  createdAt: Date
  updatedAt: Date
}

export type TemplateStepGroupFormSubmitAction = (
  _prev: unknown,
  value: TemplateStepGroupFormValues,
  id?: string,
) => Promise<ActionResponse>

export const templateStepGroupFieldValidators = {
  name: templateStepGroupSchema.shape.name,
  description: templateStepGroupSchema.shape.description,
  type: templateStepGroupSchema.shape.type,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save template step group.'
}

function isTemplateStepGroupRow(value: unknown): value is TemplateStepGroupTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'description' in value &&
    (typeof value.description === 'string' || value.description === null) &&
    'type' in value &&
    (value.type === 'ACTION' || value.type === 'VALIDATION') &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

export function getTemplateStepGroupRows(data: ActionResponseData | undefined): TemplateStepGroupTableRow[] {
  return Array.isArray(data) ? data.filter(isTemplateStepGroupRow) : []
}
