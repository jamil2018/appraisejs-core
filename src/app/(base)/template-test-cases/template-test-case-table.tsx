import type { TemplateTestCase, TemplateTestCaseStep } from '@prisma/client'
import { deleteTemplateTestCaseAction } from '@/actions/template-test-case/template-test-case-actions'
import { DataTable } from '@/components/ui/data-table'

import { templateTestCaseTableCols } from './template-test-case-table-columns'

type TemplateTestCaseWithSteps = TemplateTestCase & { steps: TemplateTestCaseStep[] }

export default function TemplateTestCaseTable({ rows }: { rows: TemplateTestCaseWithSteps[] }) {
  const projectId = rows[0]?.targetProjectId
  const viewKey = typeof projectId === 'string' && projectId ? `template-test-cases:${projectId}` : undefined

  return (
    <DataTable
      key={viewKey}
      viewKey={viewKey}
      tableLabel="Case templates"
      columns={templateTestCaseTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search case templates"
      modifyLink="/template-test-cases/modify"
      deleteAction={deleteTemplateTestCaseAction}
      density="compact"
      initialColumnVisibility={{ description: false, createdAt: false }}
    />
  )
}
