import { deleteTestCaseAction, getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { DataTable } from '@/components/ui/data-table'
import { testCaseTableCols } from './test-case-table-columns'
import { Cog, LayoutPanelTop } from 'lucide-react'

import { getTestCaseRows } from './test-case-row-helpers'

export default async function TestCaseTable() {
  const { data: testCases } = await getAllTestCasesAction()
  const testCaseRows = getTestCaseRows(testCases)

  return (
    <>
      <DataTable
        columns={testCaseTableCols}
        data={testCaseRows}
        filterColumn="title"
        filterPlaceholder="Filter by title..."
        modifyLink="/test-cases/modify"
        deleteAction={deleteTestCaseAction}
        multiOptionCreateButton={true}
        createButtonOptions={[
          {
            label: 'From Scratch',
            link: '/test-cases/create',
            icon: <Cog className="size-4" />,
          },
          {
            label: 'From Template',
            link: '/test-cases/create-from-template',
            icon: <LayoutPanelTop className="size-4" />,
          },
        ]}
      />
    </>
  )
}
