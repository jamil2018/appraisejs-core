import { DataTable } from '@/components/ui/data-table'
import React from 'react'
import { templateTestCaseTableCols } from './template-test-case-table-columns'
import {
  getAllTemplateTestCasesAction,
  deleteTemplateTestCaseAction,
} from '@/actions/template-test-case/template-test-case-actions'
import { TemplateTestCase, TemplateTestCaseStep } from '@prisma/client'

type TemplateTestCaseWithSteps = TemplateTestCase & {
  steps: TemplateTestCaseStep[]
}

const TemplateTestCaseTable = async () => {
  const { data: templateTestCases } = await getAllTemplateTestCasesAction()

  return (
    <>
      <DataTable
        columns={templateTestCaseTableCols}
        data={templateTestCases as TemplateTestCaseWithSteps[]}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/template-test-cases/create"
        modifyLink="/template-test-cases/modify"
        deleteAction={deleteTemplateTestCaseAction}
      />
    </>
  )
}

export default TemplateTestCaseTable
