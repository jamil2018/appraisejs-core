import { deleteTemplateStepAction, getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { DataTable } from '@/components/ui/data-table'
import { templateStepTableCols } from './template-step-table-columns'
import { TemplateStep } from '@prisma/client'

const TemplateStepTable = async () => {
  const { data: templateSteps } = await getAllTemplateStepsAction()

  return (
    <>
      <DataTable
        columns={templateStepTableCols}
        data={templateSteps as TemplateStep[]}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/template-steps/create"
        modifyLink="/template-steps/modify"
        deleteAction={deleteTemplateStepAction}
      />
    </>
  )
}

export default TemplateStepTable
