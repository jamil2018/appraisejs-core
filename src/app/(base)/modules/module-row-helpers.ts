import type { ActionResponseData } from '@/types/form/actionHandler'

import type { ModuleTableRow } from './module-types'

function isModuleParent(value: unknown): value is ModuleTableRow['parent'] {
  return (
    value === null || (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string')
  )
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
