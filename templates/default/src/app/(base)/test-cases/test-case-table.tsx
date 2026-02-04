import { deleteTestCaseAction, getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { DataTable } from '@/components/ui/data-table'
import { TestCase, TestCaseStep } from '@prisma/client'
import { testCaseTableCols } from './test-case-table-columns'
import { Cog, LayoutPanelTop } from 'lucide-react'

export default async function TestCaseTable() {
  const { data: testCases } = await getAllTestCasesAction()

  return (
    <>
      <DataTable
        columns={testCaseTableCols}
        data={testCases as (TestCase & { steps: TestCaseStep[] })[]}
        filterColumn="title"
        filterPlaceholder="Filter by title..."
        modifyLink="/test-cases/modify"
        deleteAction={deleteTestCaseAction}
        multiOptionCreateButton={true}
        createButtonOptions={[
          {
            label: 'From Scratch',
            link: '/test-cases/create',
            icon: <Cog className="h-4 w-4" />,
          },
          {
            label: 'From Template',
            link: '/test-cases/create-from-template',
            icon: <LayoutPanelTop className="h-4 w-4" />,
          },
        ]}
      />
    </>
  )
}
