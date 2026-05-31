import {
  environmentSchema,
  type Environment as EnvironmentFormValues,
} from '@/constants/form-opts/environment-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export type EnvironmentTableRow = {
  id: string
  name: string
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  password: string | null
  createdAt: Date
  updatedAt: Date
}

export type EnvironmentFormSubmitAction = (
  _prev: unknown,
  value: EnvironmentFormValues,
  id?: string,
) => Promise<ActionResponse>

export const environmentFieldValidators = {
  name: environmentSchema.shape.name,
  baseUrl: environmentSchema.shape.baseUrl,
  apiBaseUrl: environmentSchema.shape.apiBaseUrl,
  username: environmentSchema.shape.username,
  password: environmentSchema.shape.password,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save environment.'
}

function isEnvironmentRow(value: unknown): value is EnvironmentTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'baseUrl' in value &&
    typeof value.baseUrl === 'string' &&
    'apiBaseUrl' in value &&
    (typeof value.apiBaseUrl === 'string' || value.apiBaseUrl === null) &&
    'username' in value &&
    (typeof value.username === 'string' || value.username === null) &&
    'password' in value &&
    (typeof value.password === 'string' || value.password === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

export function getEnvironmentTableRows(data: ActionResponseData | undefined): EnvironmentTableRow[] {
  return Array.isArray(data) ? data.filter(isEnvironmentRow) : []
}
