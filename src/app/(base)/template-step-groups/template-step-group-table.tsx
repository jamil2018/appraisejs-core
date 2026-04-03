import { DataTable } from '@/components/ui/data-table'
import React from 'react'
import { templateStepGroupTableCols } from './template-step-group-table-columns'
import {
  getAllTemplateStepGroupsAction,
  deleteTemplateStepGroupAction,
} from '@/actions/template-step-group/template-step-group-actions'
import { getTemplateStepGroupRows } from './template-step-group-helpers'

const TemplateStepGroupTable = async () => {
  const { data: templateStepGroups, error: templateStepGroupsError } = await getAllTemplateStepGroupsAction()

  if (templateStepGroupsError) {
    return <div>Error: {templateStepGroupsError}</div>
  }

  const templateStepGroupRows = getTemplateStepGroupRows(templateStepGroups)

  return (
    <>
      <DataTable
        columns={templateStepGroupTableCols}
        data={templateStepGroupRows}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/template-step-groups/create"
        modifyLink="/template-step-groups/modify"
        deleteAction={deleteTemplateStepGroupAction}
      />
    </>
  )
}

export default TemplateStepGroupTable
