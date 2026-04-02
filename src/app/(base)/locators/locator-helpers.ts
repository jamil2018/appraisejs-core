import type { ActionResponseData } from '@/types/form/actionHandler'
import type { ConflictResolution, Locator, LocatorGroup } from '@prisma/client'

export type LocatorTableRow = Locator & {
  locatorGroup: LocatorGroup | null
  conflicts: ConflictResolution[]
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'route' in value &&
    typeof value.route === 'string' &&
    'moduleId' in value &&
    typeof value.moduleId === 'string' &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isConflictRow(value: unknown): value is ConflictResolution {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'locatorId' in value &&
    typeof value.locatorId === 'string' &&
    'originalSelector' in value &&
    typeof value.originalSelector === 'string' &&
    'resolvedSelector' in value &&
    (typeof value.resolvedSelector === 'string' || value.resolvedSelector === null) &&
    'status' in value &&
    typeof value.status === 'string' &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isLocatorTableRow(value: unknown): value is LocatorTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'value' in value &&
    typeof value.value === 'string' &&
    'locatorGroupId' in value &&
    (typeof value.locatorGroupId === 'string' || value.locatorGroupId === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date &&
    'locatorGroup' in value &&
    (value.locatorGroup === null || isLocatorGroupRow(value.locatorGroup)) &&
    'conflicts' in value &&
    Array.isArray(value.conflicts) &&
    value.conflicts.every(isConflictRow)
  )
}

export function getLocatorTableRows(data: ActionResponseData | undefined): LocatorTableRow[] {
  return Array.isArray(data) ? data.filter(isLocatorTableRow) : []
}
