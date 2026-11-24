import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'
import { DataTable } from '@/components/ui/data-table'
import type { TestCasePickerRow } from '@/types/test-case-picker'

import { testCaseTableCols } from './test-case-table-columns'

export default function TestCaseTable({ rows }: { rows: TestCasePickerRow[] }) {
  const viewKey = rows[0]?.targetProjectId && `test-cases:${rows[0].targetProjectId}`
  return (
    <DataTable
      key={viewKey}
      viewKey={viewKey}
      tableLabel="Test cases"
      columns={testCaseTableCols}
      data={rows}
      filterColumn="title"
      filterPlaceholder="Search test cases"
      modifyLink="/test-cases/modify"
      deleteAction={deleteTestCaseAction}
      density="compact"
      initialColumnVisibility={{ description: false, createdAt: false }}
    />
  )
}
