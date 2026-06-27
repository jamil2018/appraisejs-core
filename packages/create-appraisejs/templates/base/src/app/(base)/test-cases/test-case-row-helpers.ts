import type { Tag } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'
import type { TestCasePickerRow } from '@/types/test-case-picker'

function isNamedRow(value: unknown): value is { id: string; name: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTagRow(value: unknown): value is Tag {
  return isNamedRow(value)
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

export function getTestCaseRows(data: ActionResponseData | undefined): TestCasePickerRow[] {
  return Array.isArray(data) ? data.filter(isTestCaseRow) : []
}
