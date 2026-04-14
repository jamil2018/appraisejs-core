import type { ActionResponseData } from '@/types/form/actionHandler'
import type { ConflictResolution, Locator } from '@prisma/client'

export type LocatorTableRow = Locator & {
  locatorGroup: LocatorGroupSummary | null
  conflicts: ConflictResolutionSummary[]
}

export type LocatorGroupSummary = {
  name: string
}

export type ConflictResolutionSummary = Pick<ConflictResolution, 'id'>

function isLocatorGroupRow(value: unknown): value is LocatorGroupSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

function isConflictRow(value: unknown): value is ConflictResolutionSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
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
