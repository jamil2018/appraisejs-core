import type { ActionResponseData } from '@/types/form/actionHandler'

import { isTagRow, isTestSuiteTableRow } from './test-suite-row-guards'
import type { EditableTestSuite } from './test-suite-types'

function isEditableTestSuite(value: unknown): value is EditableTestSuite {
  return isTestSuiteTableRow(value) && 'tags' in value && Array.isArray(value.tags) && value.tags.every(isTagRow)
}

export function getEditableTestSuite(data: ActionResponseData | undefined) {
  return isEditableTestSuite(data) ? data : null
}
