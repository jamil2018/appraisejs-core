import { ROOT_MODULE_UUID, moduleSchema, type Module as ModuleFormValues } from '@/constants/form-opts/module-form-opts'
import type { ModuleWithParent } from '@/services/module/module-service'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export type ModuleTableRow = ModuleWithParent

export type ModuleParentOption = {
  id: string
  name: string
}

export type ModuleFormSubmitAction = (
  _prev: unknown,
  value: ModuleFormValues,
  id?: string,
) => Promise<ActionResponse>

export const moduleFieldValidators = {
  name: moduleSchema.shape.name,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save module.'
}

export function getModuleParentOptions(modules: ModuleTableRow[], excludedId?: string): ModuleParentOption[] {
  return modules
    .filter(module => module.id !== excludedId)
    .map(module => ({
      id: module.id,
      name: module.name,
    }))
}

export function getModuleFormParentId(parentId: string | null | undefined) {
  return parentId ?? ROOT_MODULE_UUID
}

function isModuleParent(value: unknown): value is ModuleTableRow['parent'] {
  return value === null || (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string')
}

function isModuleTableRow(value: unknown): value is ModuleTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'parentId' in value &&
    (typeof value.parentId === 'string' || value.parentId === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date &&
    'parent' in value &&
    isModuleParent(value.parent)
  )
}

export function getModuleTableRows(data: ActionResponseData | undefined): ModuleTableRow[] {
  return Array.isArray(data) ? data.filter(isModuleTableRow) : []
}
