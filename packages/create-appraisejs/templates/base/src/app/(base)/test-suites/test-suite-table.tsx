import { deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { DataTable } from '@/components/ui/data-table'

import type { TestSuiteTableRow } from './test-suite-helpers'
import { testSuiteTableCols } from './test-suite-table-columns'

export default function TestSuiteTable({ rows }: { rows: TestSuiteTableRow[] }) {
  const projectId = rows[0]?.targetProjectId
  const viewKey = typeof projectId === 'string' && projectId ? `test-suites:${projectId}` : undefined

  return (
    <DataTable
      key={viewKey}
      viewKey={viewKey}
      tableLabel="Test suites"
      columns={testSuiteTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search test suites"
      modifyLink="/test-suites/modify"
      deleteAction={deleteTestSuiteAction}
      density="compact"
      initialColumnVisibility={{ description: false, createdAt: false }}
    />
  )
}
